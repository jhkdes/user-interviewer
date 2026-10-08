import type { EvidenceBasis, Score } from "../rubric/rubric";
import type {
  ApplicationProfile,
  BehaviorEvidence,
  Comparison,
  EvidenceLedger,
  ExtractedFacts,
  SourceId,
} from "./types";

/**
 * Converts the extractor's null-free wire format (see schema.ts) to the clean
 * `EvidenceLedger`. Tolerant of missing optional parts: a field the model
 * omitted is treated as "none".
 */

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json =>
  typeof value === "object" && value !== null ? (value as Json) : {};
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Placeholder answers the model sometimes writes in a table cell instead of leaving it empty. */
const PLACEHOLDER =
  /^\s*(none( (mentioned|described|discussed|stated|known))?|n\/a|na|not (described|mentioned|discussed|stated|applicable)|unknown|nothing)\.?\s*$/i;

/** Like `str`, for text shown in the comparison table: a placeholder means nothing was said. */
function cell(value: unknown): string | null {
  const text = str(value);
  return text !== null && !PLACEHOLDER.test(text) ? text : null;
}
function int(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function enumOrNull<T extends string>(value: unknown): T | null {
  return typeof value === "string" && value !== "none" ? (value as T) : null;
}

function profile(value: unknown): ApplicationProfile | null {
  const item = asArray(value)[0];
  if (item === undefined) return null;
  const o = asObject(item);
  return {
    description: typeof o.description === "string" ? o.description : "",
    source: enumOrNull<SourceId>(o.source),
    fit: cell(o.fit),
    timeMinutes: int(o.timeMinutes),
    timeNote: cell(o.timeNote),
    postingAge: cell(o.postingAge),
    research: cell(o.research),
    positioning: cell(o.positioning),
    humanContact: cell(o.humanContact),
    aiUse: cell(o.aiUse),
    followUp: cell(o.followUp),
  };
}

export function fromWireLedger(wire: unknown): Omit<EvidenceLedger, "rubricVersion"> {
  const w = asObject(wire);

  const behaviors: BehaviorEvidence[] = asArray(w.behaviors).map((item) => {
    const o = asObject(item);
    const score =
      typeof o.score === "number" && o.score >= 0 && o.score <= 4 ? (o.score as Score) : null;
    return {
      id: o.id as BehaviorEvidence["id"],
      status: o.status as BehaviorEvidence["status"],
      score,
      evidenceBasis: enumOrNull<EvidenceBasis>(o.evidenceBasis),
      subSignals: asArray(o.subSignals).map((s) => ({
        name: String(asObject(s).name ?? ""),
        observation: String(asObject(s).observation ?? ""),
      })),
      quotes: asArray(o.quotes).map((q) => ({
        turnIndex: Number(asObject(q).turnIndex),
        text: String(asObject(q).text ?? ""),
      })),
      confidenceNote: str(o.confidenceNote),
      trajectoryNote: str(o.trajectoryNote),
      statusReason: str(o.statusReason),
    };
  });

  const f = asObject(w.facts);
  const matchRate = asObject(f.matchRate);
  const facts: ExtractedFacts = {
    targetSummary: str(f.targetSummary),
    matchRate: {
      matched: int(matchRate.matched),
      outOf: int(matchRate.outOf),
      basis: enumOrNull<EvidenceBasis>(matchRate.basis),
    },
    totalConversations: int(f.totalConversations),
    sources: asArray(f.sources).map((s) => ({
      source: asObject(s).source as SourceId,
      count: int(asObject(s).count),
    })),
    effortSplit: asArray(f.effortSplit).map((s) => ({
      source: asObject(s).source as SourceId,
      sharePercent: int(asObject(s).sharePercent),
      qualitative: str(asObject(s).qualitative),
    })),
    volunteeredContext: asArray(f.volunteeredContext).map(String),
  };

  const c = asObject(w.comparison);
  const typicalFlag = c.describedApplicationIsTypical;
  const comparison: Comparison = {
    typical: profile(c.typical),
    successful: profile(c.successful),
    successfulIsFurthestProgressOnly: c.successfulIsFurthestProgressOnly === true,
    describedApplicationIsTypical:
      typicalFlag === "yes" ? true : typicalFlag === "no" ? false : null,
    participantExplanation: str(c.participantExplanation),
  };

  const priority = asObject(asArray(w.reportPriority)[0]);
  const reportPriority =
    typeof priority.text === "string" && priority.text.trim() !== ""
      ? { text: priority.text, turnIndex: Number(priority.turnIndex) }
      : null;

  const conflicts = asArray(w.conflicts).map((item) => ({
    description: String(asObject(item).description ?? ""),
    turnIndexes: asArray(asObject(item).turnIndexes).map(Number),
  }));

  return { behaviors, facts, comparison, reportPriority, conflicts };
}
