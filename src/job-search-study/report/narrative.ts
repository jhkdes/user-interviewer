import type { AggregatedLedger } from "../ledger/aggregate";
import type { ApplicationProfile } from "../ledger/types";
import type { Rubric } from "../rubric/rubric";
import type { ScoringResult } from "../scoring/score";
import type { StructuredCompletion } from "../extraction/extract";
import { SOURCE_LABELS } from "./analysis";
import {
  checkNarrative,
  extractNumbers,
  type NarrativeExpectations,
  type NarrativeText,
} from "./check-narrative";
import type { ChannelAnalysis, ContextRow, ReportExperiment, StartingLineRow } from "./types";

/**
 * The narrative stage: a model writes the participant-facing prose from a
 * "pack" of facts, and nothing else. The pack holds only what the participant
 * told us plus the bands and labels the scoring code assigned. It has no
 * numeric scores and no percentiles, so the writer cannot repeat them.
 * `checkNarrative` then verifies the output, and one retry feeds back any
 * violations.
 */

export interface PackDimension {
  id: string;
  name: string;
  question: string;
  band: string | null;
  behaviors: Array<{ name: string; label: string }>;
  strength: { name: string; evidence: string[] } | null;
  improvement: { name: string; evidence: string[] } | null;
}

/** An application or opportunity as the writer sees it: only the fields that have something in them. */
export type PackApplication = Record<string, string | number>;

export interface NarrativePack {
  /** What the participant most wants help with, in their words. */
  priority: string | null;
  target: string | null;
  matchRate: string | null;
  totalInterviews: number | null;
  dimensions: PackDimension[];
  /** Where their search stands today. The report shows this as a table; the writer sees it so the prose agrees with it. */
  startingLine: Array<{ label: string; value: string }>;
  typicalApplication: PackApplication | null;
  /** The opportunity that led to a conversation or interview, or the furthest-progress one. Null if none was described. */
  successfulOpportunity: PackApplication | null;
  successfulIsFurthestProgressOnly: boolean;
  participantExplanation: string | null;
  describedApplicationIsTypical: boolean | null;
  channels: Array<{
    source: string;
    interviews: number | null;
    interviewSharePercent: number | null;
    effortPercent: number | null;
    effort: string | null;
  }>;
  context: Array<{ label: string; value: string }>;
  /** Places where what they told us did not line up. Never state a conflicting figure as fact. */
  conflicts: string[];
  experimentTitles: string[];
}

export interface NarrativeInput {
  rubric: Rubric;
  aggregate: AggregatedLedger;
  scoring: ScoringResult;
  startingLine: StartingLineRow[];
  channels: ChannelAnalysis;
  context: ContextRow[];
  experiments: ReportExperiment[];
}

function evidenceFor(aggregate: AggregatedLedger, id: string): string[] {
  const entry = aggregate.behaviors.find((b) => b.id === id)?.representative;
  if (!entry) return [];
  return [
    ...entry.subSignals.slice(0, 3).map((s) => `${s.name}: ${s.observation}`),
    ...(entry.confidenceNote ? [`Note: ${entry.confidenceNote}`] : []),
    ...(entry.trajectoryNote ? [`Over time: ${entry.trajectoryNote}`] : []),
  ];
}

function packApplication(profile: ApplicationProfile | null): PackApplication | null {
  if (!profile) return null;
  const fields: Array<[string, string | number | null]> = [
    ["what it was", profile.description],
    ["how it started", profile.source ? (SOURCE_LABELS[profile.source] ?? profile.source) : null],
    ["how well it matched", profile.fit],
    ["minutes spent", profile.timeMinutes],
    ["time, in their words", profile.timeNote],
    ["how old the posting was when they applied", profile.postingAge],
    ["research before applying", profile.research],
    ["how they positioned themselves", profile.positioning],
    ["human contact", profile.humanContact],
    ["AI use", profile.aiUse],
    ["after submitting", profile.followUp],
  ];
  return Object.fromEntries(
    fields.filter(([, value]) => value !== null && value !== ""),
  ) as PackApplication;
}

export function buildNarrativePack(input: NarrativeInput): NarrativePack {
  const { rubric, aggregate, scoring } = input;
  const { facts, comparison, reportPriority } = aggregate.base;
  const nameOf = (id: string) => rubric.behaviors.find((b) => b.id === id)!.name;

  const dimensions: PackDimension[] = scoring.dimensions.map((dimension) => {
    const behaviors = scoring.behaviors
      .filter((b) => b.dimension === dimension.id)
      .map((b) => ({
        name: nameOf(b.id),
        label:
          b.label?.text ??
          (b.outcome === "not_applicable" ? "Does not apply" : "Not enough to tell"),
      }));
    return {
      id: dimension.id,
      name: dimension.name,
      question: rubric.dimensions.find((d) => d.id === dimension.id)!.question,
      band: dimension.band?.text ?? null,
      behaviors,
      strength: dimension.strength
        ? { name: nameOf(dimension.strength), evidence: evidenceFor(aggregate, dimension.strength) }
        : null,
      improvement: dimension.improvement
        ? {
            name: nameOf(dimension.improvement),
            evidence: evidenceFor(aggregate, dimension.improvement),
          }
        : null,
    };
  });

  const { matched, outOf } = facts.matchRate;
  return {
    priority: reportPriority?.text ?? null,
    target: facts.targetSummary,
    matchRate: matched !== null ? `${matched} of ${outOf ?? "?"}` : null,
    totalInterviews: input.channels.totalInterviews,
    dimensions,
    startingLine: input.startingLine.map(({ label, value }) => ({ label, value })),
    typicalApplication: packApplication(comparison.typical),
    successfulOpportunity: packApplication(comparison.successful),
    successfulIsFurthestProgressOnly: comparison.successfulIsFurthestProgressOnly,
    participantExplanation: comparison.participantExplanation,
    describedApplicationIsTypical: comparison.describedApplicationIsTypical,
    channels: input.channels.rows.map((row) => ({
      source: row.label,
      interviews: row.interviews,
      interviewSharePercent: row.interviewSharePercent,
      effortPercent: row.effortPercent,
      effort: row.effortNote,
    })),
    context: input.context.map(({ label, value }) => ({ label, value })),
    conflicts: aggregate.base.conflicts.map((c) => c.description),
    experimentTitles: input.experiments.map((e) => e.title),
  };
}

export function expectationsFor(pack: NarrativePack): NarrativeExpectations {
  return {
    // Every number in the data is allowed, including the ones inside text the participant gave us.
    allowedNumbers: new Set(extractNumbers(JSON.stringify(pack))),
    dimensions: pack.dimensions.map((d) => ({
      id: d.id as never,
      hasStrength: d.strength !== null,
      hasImprovement: d.improvement !== null,
    })),
    hasChannels: pack.channels.length > 0,
  };
}

export function buildNarrativeSchema(rubric: Rubric) {
  const text = { type: "string" } as const;
  return {
    type: "object",
    properties: {
      executiveSummary: {
        ...text,
        description: "About 80 to 120 words. The one idea that matters most from this interview.",
      },
      whatWeHeard: {
        ...text,
        description:
          "About 100 to 150 words. What they are looking for and how they are searching, in plain terms.",
      },
      channelsNarrative: {
        ...text,
        description:
          "About 40 to 80 words about where their conversations come from and where their time goes. Empty if there is no channel data.",
      },
      bottomLine: {
        ...text,
        description: "About 40 to 80 words. The most useful single takeaway.",
      },
      dimensions: {
        type: "array",
        description: "One entry for each dimension.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: rubric.dimensions.map((d) => d.id) },
            strengthText: {
              ...text,
              description:
                "40 to 60 words on the strength. Empty string if no strength is given in the data.",
            },
            improvementText: {
              ...text,
              description:
                "40 to 60 words on the area to build. Empty string if none is given in the data.",
            },
          },
          required: ["id", "strengthText", "improvementText"],
          additionalProperties: false,
        },
      },
    },
    required: ["executiveSummary", "whatWeHeard", "channelsNarrative", "bottomLine", "dimensions"],
    additionalProperties: false,
  } as const;
}

export const NARRATIVE_SYSTEM_PROMPT = `You write a short, personal report for a job seeker who took part in a research interview about how they search for work. You are given a data pack describing what they told us and where their search stands. Write directly to the reader as "you".

# Hard rules

- Use only facts in the data pack. Never add a fact, a number, a company, or a quote that is not there. If the data does not say, do not say.
- Do not state any numeric score, ranking, or percentile, and do not compare the reader with other job seekers. You may use the bands and labels in the data (Strong, Developing, Opportunity; Doing well, Developing, Opportunity).
- Use a number only if it appears in the data pack. Write it as it appears there.
- Never use he, she, him, her, his, or hers, and never say "the participant". The reader is "you".
- Do not give instructions. Do not write "you should", "you must", or "you need to". Describe what you heard and what it suggests. Suggested experiments appear elsewhere in the report; you may say that some are suggested below, without describing them.
- State patterns as observations or hypotheses, not proof. Do not say anything caused an outcome. A phrase like "this suggests" or "may" is right; "this proves" is not.
- Be warm and neutral. Describe behaviors, not the reader's worth or ability. Never blame. Treat an "Opportunity" label as something with room to grow, and say what you did hear that supports it.
- If a dimension has no band, say there was not enough in the interview to say, and do not guess.
- If the data includes what they most want help with, acknowledge it directly and connect the report to it.
- If you were given no strength or no improvement for a dimension, leave that text as an empty string.
- If the data lists conflicts (places where what they told us did not line up, such as a screener figure that differs from the interview), do not state either conflicting figure as fact. Leave it out, or say gently that the figures did not line up.
- Say two things are similar or different only when the data states both sides. A blank or missing cell is unknown, never "the same".

# What to write

- executiveSummary: the single most useful idea. Start with what is going well if something is, then the main opportunity.
- whatWeHeard: what they are looking for and how they search now, plain and specific. The data includes their starting line, which the page shows as a table, so do not repeat every number.
- channelsNarrative: where conversations came from and where their time goes, if given.
- bottomLine: one clear takeaway that ties together what they told us and what they most want help with.
- For each dimension, a short paragraph on the strength and one on the area to build, grounded in the evidence lines in the data.

Keep each piece within the length in the schema. Plain words, no jargon, no bullet points inside the text.`;

export interface NarrativeResult {
  narrative: NarrativeText;
  violations: string[];
  attempts: number;
}

function isNarrativeShaped(value: unknown): value is NarrativeText {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.executiveSummary === "string" &&
    typeof v.whatWeHeard === "string" &&
    typeof v.bottomLine === "string" &&
    Array.isArray(v.dimensions)
  );
}

function normalize(value: NarrativeText): NarrativeText {
  return {
    executiveSummary: value.executiveSummary ?? "",
    whatWeHeard: value.whatWeHeard ?? "",
    channelsNarrative: value.channelsNarrative ?? "",
    bottomLine: value.bottomLine ?? "",
    dimensions: (value.dimensions ?? []).map((d) => ({
      id: d.id,
      strengthText: d.strengthText ?? "",
      improvementText: d.improvementText ?? "",
    })),
  };
}

const EMPTY_NARRATIVE: NarrativeText = {
  executiveSummary: "",
  whatWeHeard: "",
  channelsNarrative: "",
  bottomLine: "",
  dimensions: [],
};

export async function generateNarrative(
  deps: { complete: StructuredCompletion; rubric: Rubric; maxAttempts?: number },
  pack: NarrativePack,
): Promise<NarrativeResult> {
  const maxAttempts = deps.maxAttempts ?? 2;
  const expectations = expectationsFor(pack);
  const schema = buildNarrativeSchema(deps.rubric);
  const baseUser = `Data pack (JSON):\n\n${JSON.stringify(pack, null, 2)}`;

  let feedback = "";
  let last: NarrativeResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await deps.complete({
      system: NARRATIVE_SYSTEM_PROMPT,
      user: baseUser + feedback,
      schema,
      maxTokens: 4000,
      toolName: "write_report",
    });
    if (!isNarrativeShaped(raw)) {
      last = {
        narrative: EMPTY_NARRATIVE,
        violations: ["The writer's output was not shaped like a narrative"],
        attempts: attempt,
      };
      continue;
    }
    const narrative = normalize(raw);
    const violations = checkNarrative(narrative, expectations);
    last = { narrative, violations, attempts: attempt };
    if (violations.length === 0) return last;
    feedback = `\n\nYour previous draft broke these rules. Rewrite the whole report and fix every one:\n- ${violations.join("\n- ")}`;
  }
  return last!;
}
