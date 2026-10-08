import type { BehaviorId, DimensionId } from "../rubric/rubric";
import type { SourceId } from "../ledger/types";

/**
 * The participant-facing report, as data. Everything the HTML page shows is
 * here, so the page is a pure rendering of this object. It never contains
 * numeric scores or percentiles: participants see bands and labels only.
 */

export interface ContextRow {
  label: string;
  value: string;
  /** Where the fact came from, so the page can mark self-reported screener answers. */
  origin: "screener" | "interview";
}

/** One line of the participant's "starting line": where their search stands today, in their own numbers. */
export interface StartingLineRow {
  label: string;
  value: string;
  origin: "screener" | "interview";
}

export interface ChannelRow {
  source: SourceId;
  label: string;
  interviews: number | null;
  /** Share of the participant's counted conversations, 0 to 100. Null when counts are missing. */
  interviewSharePercent: number | null;
  /** A stated percentage of search time. Null when they gave none. */
  effortPercent: number | null;
  /** The participant's own words about effort on this path, when they gave no number. */
  effortNote: string | null;
}

export interface ChannelMismatch {
  kind: "effort_exceeds_yield" | "yield_exceeds_effort";
  source: SourceId;
  interviewSharePercent: number;
  effortPercent: number;
}

export interface ChannelAnalysis {
  rows: ChannelRow[];
  totalInterviews: number | null;
  /** True when every row with effort data has a percentage, so effort can be compared with results. */
  effortIsNumeric: boolean;
  mismatches: ChannelMismatch[];
}

/** One row of the typical-versus-successful comparison. Kept for the researcher's review and the cohort baseline; not shown to participants. */
export interface ComparisonRow {
  label: string;
  typical: string | null;
  successful: string | null;
}

export type BehaviorDisplayLabel =
  "Doing well" | "Developing" | "Opportunity" | "Not enough to tell" | "Does not apply";

export interface ReportBehavior {
  id: BehaviorId;
  name: string;
  label: BehaviorDisplayLabel;
}

export interface ReportDimension {
  id: DimensionId;
  name: string;
  question: string;
  /** Strong / Developing / Opportunity, or null when there was not enough evidence to rate it. */
  band: string | null;
  bandId: string | null;
  behaviors: ReportBehavior[];
  strength: BehaviorId | null;
  improvement: BehaviorId | null;
  /** Written by the narrative stage; empty string when there is nothing to say. */
  strengthText: string;
  improvementText: string;
}

export interface ReportExperiment {
  id: string;
  title: string;
  /** The behavior this experiment is mainly aimed at. */
  forBehavior: BehaviorId;
  why: string;
  steps: string[];
  effort: string;
  track: string;
  /** Why it was picked for this participant, shown to a reviewer. */
  reason: string;
}

export interface Report {
  /** The participant's answer to the closing question, if they gave one. */
  priority: string | null;
  executiveSummary: string;
  whatWeHeard: string;
  dimensions: ReportDimension[];
  startingLine: StartingLineRow[];
  channels: ChannelAnalysis;
  channelsNarrative: string;
  context: ContextRow[];
  experiments: ReportExperiment[];
  bottomLine: string;
}
