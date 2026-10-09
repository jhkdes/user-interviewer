import type { BehaviorId, EvidenceBasis, Score } from "../rubric/rubric";

/**
 * The evidence ledger: the structured result of reading one interview
 * transcript against the rubric. It is the only thing the scoring code, the
 * report analysis, and the review page read: nothing downstream goes back to
 * the raw transcript except to show quotes.
 *
 * `turnIndex` always refers to the position of a turn in the transcript array
 * given to the extractor.
 */

export type BehaviorStatus = "rated" | "insufficient_evidence" | "not_applicable";

export interface LedgerQuote {
  turnIndex: number;
  /** Copied from the participant's words in that turn. */
  text: string;
}

export interface SubSignalNote {
  /** Which sub-signal from the rubric this note is about (free text, usually copied from the rubric). */
  name: string;
  observation: string;
}

export interface BehaviorEvidence {
  id: BehaviorId;
  status: BehaviorStatus;
  /** 0-4 anchor chosen by the extractor. Present only when `status` is "rated". */
  score: Score | null;
  /** The best kind of evidence behind the score. Present only when `status` is "rated"; drives the cap. */
  evidenceBasis: EvidenceBasis | null;
  subSignals: SubSignalNote[];
  quotes: LedgerQuote[];
  /** Contradictions or uncertainty that affect confidence, if any. */
  confidenceNote: string | null;
  /** How behavior changed over the search, when meaningfully different from now. */
  trajectoryNote: string | null;
  /** For insufficient_evidence or not_applicable: why. */
  statusReason: string | null;
}

export type SourceId =
  | "cold_application"
  | "referral_from_contact"
  | "recruiter_inbound"
  | "recruiter_sought"
  | "former_colleague_or_network"
  | "direct_outreach"
  | "community_or_event"
  | "content_or_research"
  | "other";

export interface SourceCount {
  source: SourceId;
  /** Stated or clearly implied count; null when the participant gave none. */
  count: number | null;
}

export interface EffortShare {
  source: SourceId;
  /** A stated or clearly implied percentage of search time; null when none was given. */
  sharePercent: number | null;
  /** The participant's own words about effort on this path, when they gave no number. */
  qualitative: string | null;
}

/** One application or opportunity, described for the typical-versus-successful comparison. */
export interface ApplicationProfile {
  description: string;
  source: SourceId | null;
  /** How well it matched, in the participant's terms. */
  fit: string | null;
  /** Rough minutes spent; a range uses the midpoint and is explained in `timeNote`. */
  timeMinutes: number | null;
  timeNote: string | null;
  /** How old the posting was when they applied, in their words (for example "about a week"). Null if they did not say. */
  postingAge: string | null;
  /** What they did to understand the role or company beforehand. */
  research: string | null;
  /** How they positioned themselves (resume tailoring, story). */
  positioning: string | null;
  /** Whether anyone knew them before or soon after they applied. */
  humanContact: string | null;
  aiUse: string | null;
  /** What they did after submitting. */
  followUp: string | null;
}

export interface Comparison {
  /** A typical recent application. Null if none was described. */
  typical: ApplicationProfile | null;
  /** The opportunity that produced a recruiter conversation or interview, or the furthest-progress one. Null if none was described. */
  successful: ApplicationProfile | null;
  /** True when `successful` is the furthest-progress opportunity because no interview has happened yet. */
  successfulIsFurthestProgressOnly: boolean;
  /** Whether the participant said the described application is typical of how they apply. Null if not asked or unclear. */
  describedApplicationIsTypical: boolean | null;
  /** The participant's own explanation of what was different, in their words. */
  participantExplanation: string | null;
}

export interface ExtractedFacts {
  /** One or two sentences on the target the participant described. Null if none. */
  targetSummary: string | null;
  matchRate: {
    matched: number | null;
    outOf: number | null;
    basis: EvidenceBasis | null;
  };
  totalConversations: number | null;
  sources: SourceCount[];
  effortSplit: EffortShare[];
  /** Context the participant volunteered (energy, pressure, gap, and so on). Never scored. */
  volunteeredContext: string[];
  /** Names of the coach, outplacement firm, or program the participant named in the interview. Empty if none was named. */
  supportProviders: string[];
}

export interface ReportPriority {
  /** The participant's answer to the closing question, faithful and concise. */
  text: string;
  turnIndex: number;
}

export interface Conflict {
  description: string;
  turnIndexes: number[];
}

export interface EvidenceLedger {
  rubricVersion: string;
  behaviors: BehaviorEvidence[];
  facts: ExtractedFacts;
  comparison: Comparison;
  reportPriority: ReportPriority | null;
  /** Contradictions within the interview or between the interview and the screener. */
  conflicts: Conflict[];
}
