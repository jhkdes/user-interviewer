import type { AggregatedLedger } from "../ledger/aggregate";
import type { StructuredCompletion } from "../extraction/extract";
import type { Rubric } from "../rubric/rubric";
import { scoreLedger, type ScoringResult } from "../scoring/score";
import {
  analyzeChannels,
  buildComparisonRows,
  buildContextRows,
  buildStartingLine,
} from "./analysis";
import { selectExperiments, usesAiFrom } from "./experiments";
import { buildNarrativePack, generateNarrative, type NarrativePack } from "./narrative";
import { checkReportText, type NarrativeText } from "./check-narrative";
import type { BehaviorDisplayLabel, ComparisonRow, Report, ReportDimension } from "./types";

export interface GenerateReportInput {
  rubric: Rubric;
  aggregate: AggregatedLedger;
  screenerAnswers: Record<string, string | string[]> | null;
}

export interface GeneratedReport {
  report: Report;
  scoring: ScoringResult;
  /** What the writer was given. Kept so a reviewer can see exactly what the prose is based on. */
  pack: NarrativePack;
  /** The typical-versus-successful comparison. Not shown to participants; kept for the reviewer and the cohort baseline. */
  comparison: ComparisonRow[];
  /** Rule violations left in the narrative after retries. A non-empty list needs a human before release. */
  narrativeViolations: string[];
  narrativeAttempts: number;
  /** Problems in text built by code from the ledger (table cells, context, priority). Needs a human before release. */
  textViolations: string[];
}

/** Everything except the narrative: tables, bands, context, and experiments, all built by code. */
export function buildReportSkeleton(input: GenerateReportInput) {
  const { rubric, aggregate, screenerAnswers } = input;
  const scoring = scoreLedger(rubric, aggregate);
  const ledger = aggregate.base;
  const channels = analyzeChannels(ledger.facts);
  const comparison = buildComparisonRows(ledger.comparison);
  const startingLine = buildStartingLine(screenerAnswers, ledger, channels);
  const context = buildContextRows(screenerAnswers, ledger);
  const experiments = selectExperiments({
    rubric,
    scoring,
    priorityText: ledger.reportPriority?.text ?? null,
    channels,
    usesAi: usesAiFrom(aggregate),
  });
  const pack = buildNarrativePack({
    rubric,
    aggregate,
    scoring,
    startingLine,
    channels,
    context,
    experiments,
  });
  return { scoring, channels, comparison, startingLine, context, experiments, pack };
}

function displayLabel(
  outcome: "scored" | "insufficient_evidence" | "not_applicable",
  label: string | undefined,
): BehaviorDisplayLabel {
  if (outcome === "not_applicable") return "Does not apply";
  if (outcome === "insufficient_evidence" || !label) return "Not enough to tell";
  return label as BehaviorDisplayLabel;
}

export function assembleReport(
  input: GenerateReportInput,
  skeleton: ReturnType<typeof buildReportSkeleton>,
  narrative: NarrativeText,
): Report {
  const { rubric, aggregate } = input;
  const { scoring } = skeleton;

  const dimensions: ReportDimension[] = scoring.dimensions.map((dimension) => {
    const spec = rubric.dimensions.find((d) => d.id === dimension.id)!;
    const text = narrative.dimensions.find((d) => d.id === dimension.id);
    return {
      id: dimension.id,
      name: dimension.name,
      question: spec.question,
      band: dimension.band?.text ?? null,
      bandId: dimension.band?.id ?? null,
      behaviors: scoring.behaviors
        .filter((b) => b.dimension === dimension.id)
        .map((b) => ({
          id: b.id,
          name: rubric.behaviors.find((x) => x.id === b.id)!.name,
          label: displayLabel(b.outcome, b.label?.text),
        })),
      strength: dimension.strength,
      improvement: dimension.improvement,
      strengthText: text?.strengthText ?? "",
      improvementText: text?.improvementText ?? "",
    };
  });

  return {
    priority: aggregate.base.reportPriority?.text ?? null,
    executiveSummary: narrative.executiveSummary,
    whatWeHeard: narrative.whatWeHeard,
    dimensions,
    startingLine: skeleton.startingLine,
    channels: skeleton.channels,
    channelsNarrative: narrative.channelsNarrative,
    context: skeleton.context,
    experiments: skeleton.experiments,
    bottomLine: narrative.bottomLine,
  };
}

/** Builds the whole report: code for everything measurable, one model call for the prose. */
export async function generateReport(
  deps: { complete: StructuredCompletion },
  input: GenerateReportInput,
): Promise<GeneratedReport> {
  const skeleton = buildReportSkeleton(input);
  const result = await generateNarrative(
    { complete: deps.complete, rubric: input.rubric },
    skeleton.pack,
  );
  const report = assembleReport(input, skeleton, result.narrative);
  const textViolations = checkReportText([
    { where: "the priority", text: report.priority },
    ...report.startingLine.map((row) => ({
      where: `starting line "${row.label}"`,
      text: row.value,
    })),
    ...report.context.map((row) => ({ where: `context "${row.label}"`, text: row.value })),
  ]);
  return {
    report,
    textViolations,
    scoring: skeleton.scoring,
    pack: skeleton.pack,
    comparison: skeleton.comparison,
    narrativeViolations: result.violations,
    narrativeAttempts: result.attempts,
  };
}
