import library from "./experiments.json";
import type { AggregatedLedger } from "../ledger/aggregate";
import type { BehaviorId, DimensionId, Rubric } from "../rubric/rubric";
import type { ScoringResult } from "../scoring/score";
import type { ChannelAnalysis, ReportExperiment } from "./types";

/**
 * Chooses the experiments to suggest. Selection is deterministic and
 * explainable: improvement areas are ranked by how weak the behavior is and
 * how much weight it carries, the area the participant said they most want help
 * with gets a boost, and picks are spread across dimensions before any
 * dimension gets a second one.
 */

export interface LibraryExperiment {
  id: string;
  behavior: BehaviorId;
  title: string;
  why: string;
  steps: string[];
  effort: string;
  track: string;
  /** Only suggest when this holds for the participant. */
  requires?: "uses_ai";
}

export interface ExperimentLibrary {
  version: string;
  experiments: LibraryExperiment[];
}

export function loadExperimentLibrary(rubric: Rubric): ExperimentLibrary {
  const typed = library as unknown as ExperimentLibrary;
  const errors = validateExperimentLibrary(rubric, typed);
  if (errors.length > 0) throw new Error(`Invalid experiment library:\n- ${errors.join("\n- ")}`);
  return typed;
}

export function validateExperimentLibrary(rubric: Rubric, lib: ExperimentLibrary): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const experiment of lib.experiments) {
    if (ids.has(experiment.id)) errors.push(`duplicate experiment id ${experiment.id}`);
    ids.add(experiment.id);
    if (!rubric.behaviors.some((behavior) => behavior.id === experiment.behavior)) {
      errors.push(`${experiment.id}: unknown behavior ${experiment.behavior}`);
    }
    if (experiment.steps.length < 3 || experiment.steps.length > 5) {
      errors.push(`${experiment.id}: needs 3 to 5 steps, has ${experiment.steps.length}`);
    }
    for (const field of ["title", "why", "effort", "track"] as const) {
      if (!experiment[field]?.trim()) errors.push(`${experiment.id}: missing ${field}`);
    }
  }
  for (const behavior of rubric.behaviors) {
    if (!lib.experiments.some((experiment) => experiment.behavior === behavior.id)) {
      errors.push(`no experiment for ${behavior.id}`);
    }
  }
  return errors;
}

/** Words in the participant's own statement of what they want help with, grouped by the dimension they point to. */
const PRIORITY_PATTERNS: Array<{ dimension: DimensionId; pattern: RegExp }> = [
  {
    dimension: "reach",
    pattern:
      /network|referral|reach(ing)? out|human|conversation|connect|relationship|introduc|recruiter|warm/i,
  },
  {
    dimension: "pitch",
    pattern:
      /resume|r[eé]sum[eé]|cover letter|stand out|tailor|position|my story|pitch|application (materials|quality)/i,
  },
  {
    dimension: "focus",
    pattern:
      /which (jobs|roles)|what (kind|type) of (job|role)|my target|niche|focus|career change|pivot|direction|find(ing)? (the )?(right )?(jobs|roles|openings|postings)|job (boards|alerts)|hear about (roles|jobs)|first to apply|sourc(e|ing)/i,
  },
  {
    dimension: "learn",
    pattern: /track|measure|what works|what'?s working|data|metrics|analy[sz]e/i,
  },
];

export function priorityDimensions(priorityText: string | null): DimensionId[] {
  if (!priorityText) return [];
  return PRIORITY_PATTERNS.filter(({ pattern }) => pattern.test(priorityText)).map(
    ({ dimension }) => dimension,
  );
}

const PRIORITY_BOOST = 60;
const MISMATCH_BOOST = 40;
const MAX_EXPERIMENTS = 3;

export interface ExperimentSelectionInput {
  rubric: Rubric;
  scoring: ScoringResult;
  priorityText: string | null;
  channels: ChannelAnalysis;
  usesAi: boolean;
}

interface Candidate {
  behavior: BehaviorId;
  dimension: DimensionId;
  need: number;
  reasons: string[];
}

export function selectExperiments(input: ExperimentSelectionInput): ReportExperiment[] {
  const { rubric, scoring, priorityText, channels, usesAi } = input;
  const lib = loadExperimentLibrary(rubric);
  const priorityDims = new Set(priorityDimensions(priorityText));

  // Candidates: scored behaviors at 2 or below. The weaker and heavier, the greater the need.
  const candidates: Candidate[] = [];
  for (const scored of scoring.behaviors) {
    if (scored.outcome !== "scored" || scored.score === null || scored.score > 2) continue;
    const spec = rubric.behaviors.find((behavior) => behavior.id === scored.id)!;
    const reasons = [`${spec.name} is an area to build (${scored.label!.text})`];
    let need = (4 - scored.score) * spec.weight;

    if (priorityDims.has(spec.dimension)) {
      need += PRIORITY_BOOST;
      reasons.push("it matches what you said you most want help with");
    }
    if (
      channels.mismatches.some((m) => m.kind === "effort_exceeds_yield") &&
      (scored.id === "L2" || scored.id === "R1")
    ) {
      need += MISMATCH_BOOST;
      reasons.push("your time and your results do not line up");
    }
    candidates.push({ behavior: scored.id, dimension: spec.dimension, need, reasons });
  }

  const byNeed = (a: Candidate, b: Candidate) =>
    b.need - a.need ||
    rubric.behaviors.findIndex((x) => x.id === a.behavior) -
      rubric.behaviors.findIndex((x) => x.id === b.behavior);
  const ranked = [...candidates].sort(byNeed);

  const chosen: Candidate[] = [];
  const usedDimensions = new Set<DimensionId>();
  // First pass: the highest-need behavior in each dimension.
  for (const candidate of ranked) {
    if (chosen.length >= MAX_EXPERIMENTS) break;
    if (usedDimensions.has(candidate.dimension)) continue;
    chosen.push(candidate);
    usedDimensions.add(candidate.dimension);
  }
  // Second pass: fill any remaining slots with the next highest need.
  for (const candidate of ranked) {
    if (chosen.length >= MAX_EXPERIMENTS) break;
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }
  chosen.sort(byNeed);

  const experiments: ReportExperiment[] = [];
  for (const candidate of chosen) {
    const match = lib.experiments.find(
      (experiment) =>
        experiment.behavior === candidate.behavior && (experiment.requires !== "uses_ai" || usesAi),
    );
    if (!match) continue;
    experiments.push({
      id: match.id,
      title: match.title,
      forBehavior: match.behavior,
      why: match.why,
      steps: match.steps,
      effort: match.effort,
      track: match.track,
      reason: candidate.reasons.join("; "),
    });
  }
  return experiments;
}

/** True if the participant has used AI in their search, from the rubric's P4 status. */
export function usesAiFrom(aggregate: AggregatedLedger): boolean {
  const p4 = aggregate.behaviors.find((behavior) => behavior.id === "P4");
  return !!p4 && p4.status !== "not_applicable";
}
