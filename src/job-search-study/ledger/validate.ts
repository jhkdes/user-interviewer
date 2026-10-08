import type { InterviewTurn } from "@/llm";
import type { BehaviorId, Rubric } from "../rubric/rubric";
import { verifyQuote } from "./quotes";
import { SOURCE_IDS } from "./schema";
import type { BehaviorEvidence, EvidenceLedger } from "./types";

export interface LedgerIssue {
  severity: "error" | "warning";
  behavior?: BehaviorId;
  message: string;
}

export interface LedgerValidationResult {
  /** The ledger with unverifiable quotes dropped and relocated quotes re-indexed. */
  ledger: EvidenceLedger;
  issues: LedgerIssue[];
  /** No errors. Warnings do not make a ledger unusable. */
  ok: boolean;
}

/**
 * Deterministic checks on a ledger produced by the extractor. Verifies and
 * cleans quotes against the transcript, and reports structural problems that
 * the JSON schema cannot express (one entry per behavior, status and score
 * consistency, counts that do not add up). Errors mean the extraction should
 * be re-run; warnings are surfaced to the reviewer.
 */
export function validateLedger(
  rubric: Rubric,
  rawLedger: EvidenceLedger,
  transcript: InterviewTurn[],
): LedgerValidationResult {
  const issues: LedgerIssue[] = [];
  const add = (severity: LedgerIssue["severity"], message: string, behavior?: BehaviorId) =>
    issues.push({ severity, message, behavior });

  // Every rubric behavior appears exactly once.
  const seen = new Set<string>();
  for (const entry of rawLedger.behaviors) {
    if (seen.has(entry.id)) add("error", `Duplicate entry for ${entry.id}`, entry.id);
    seen.add(entry.id);
  }
  for (const behavior of rubric.behaviors) {
    if (!seen.has(behavior.id)) add("error", `Missing entry for ${behavior.id}`, behavior.id);
  }
  for (const id of seen) {
    if (!rubric.behaviors.some((behavior) => behavior.id === id)) {
      add("error", `Unknown behavior ${id}`);
    }
  }

  const cleanedBehaviors: BehaviorEvidence[] = rawLedger.behaviors.map((entry) => {
    const spec = rubric.behaviors.find((behavior) => behavior.id === entry.id);
    if (!spec) return entry;

    if (!["rated", "insufficient_evidence", "not_applicable"].includes(entry.status)) {
      add("error", `${entry.id} has an invalid status "${entry.status}"`, entry.id);
    }
    if (
      entry.score !== null &&
      !(Number.isInteger(entry.score) && entry.score >= 0 && entry.score <= 4)
    ) {
      add("error", `${entry.id} has an invalid score ${entry.score}`, entry.id);
    }
    if (entry.evidenceBasis !== null && !(entry.evidenceBasis in rubric.evidenceBases)) {
      add("error", `${entry.id} has an invalid evidence basis "${entry.evidenceBasis}"`, entry.id);
    }

    if (entry.status === "rated") {
      if (entry.score === null) add("error", `${entry.id} is rated but has no score`, entry.id);
      if (entry.evidenceBasis === null) {
        add("error", `${entry.id} is rated but has no evidence basis`, entry.id);
      }
    } else {
      if (entry.score !== null)
        add("error", `${entry.id} has a score but is ${entry.status}`, entry.id);
      if (entry.evidenceBasis !== null) {
        add("error", `${entry.id} has an evidence basis but is ${entry.status}`, entry.id);
      }
      if (!entry.statusReason?.trim()) add("warning", `${entry.id} has no status reason`, entry.id);
    }
    if (entry.status === "not_applicable" && spec.notApplicable === null) {
      add("error", `${entry.id} cannot be not_applicable; use insufficient_evidence`, entry.id);
    }

    // Quotes: keep verified ones (re-indexed if needed), drop the rest.
    const quotes = [];
    for (const quote of entry.quotes) {
      const result = verifyQuote(transcript, quote);
      if (result.status === "verified") {
        quotes.push(quote);
      } else if (result.status === "relocated") {
        quotes.push({ ...quote, turnIndex: result.turnIndex });
        add(
          "warning",
          `${entry.id}: quote moved from turn ${quote.turnIndex} to ${result.turnIndex}`,
          entry.id,
        );
      } else {
        add(
          "warning",
          `${entry.id}: dropped unverifiable quote (${result.reason}): "${quote.text.slice(0, 240)}"`,
          entry.id,
        );
      }
    }
    if (entry.status === "rated" && quotes.length === 0) {
      add("error", `${entry.id} is rated but has no verifiable quote`, entry.id);
    }

    return { ...entry, quotes };
  });

  // Report priority must point at a participant turn.
  const reportPriority = rawLedger.reportPriority;
  if (reportPriority) {
    const turn = transcript[reportPriority.turnIndex];
    if (!turn || turn.speaker !== "participant") {
      add("warning", `Report priority turn ${reportPriority.turnIndex} is not a participant turn`);
    }
  }

  // Facts that should be internally consistent.
  const { facts } = rawLedger;
  const validSources = new Set<string>(SOURCE_IDS);
  for (const item of [...facts.sources, ...facts.effortSplit]) {
    if (!validSources.has(item.source)) add("warning", `Unknown source "${item.source}"`);
  }
  const { matched, outOf } = facts.matchRate;
  if (matched !== null && outOf !== null && matched > outOf) {
    add("error", `Match rate ${matched} of ${outOf} is impossible`);
  }
  if (facts.totalConversations !== null && facts.totalConversations < 0) {
    add("error", "Total conversations is negative");
  }
  for (const share of facts.effortSplit) {
    if (share.sharePercent !== null && (share.sharePercent < 0 || share.sharePercent > 100)) {
      add("error", `Effort share for ${share.source} is outside 0-100`);
    }
  }
  const shares = facts.effortSplit
    .map((s) => s.sharePercent)
    .filter((n): n is number => n !== null);
  if (shares.length > 0 && shares.reduce((a, b) => a + b, 0) > 105) {
    add("warning", "Effort shares add up to more than 100%");
  }
  const counted = facts.sources.map((s) => s.count).filter((n): n is number => n !== null);
  if (
    counted.length > 0 &&
    facts.totalConversations !== null &&
    counted.reduce((a, b) => a + b, 0) !== facts.totalConversations
  ) {
    add(
      "warning",
      `Source counts add up to ${counted.reduce((a, b) => a + b, 0)} but the total is ${facts.totalConversations}`,
    );
  }

  const ledger: EvidenceLedger = { ...rawLedger, behaviors: cleanedBehaviors, reportPriority };
  return { ledger, issues, ok: !issues.some((issue) => issue.severity === "error") };
}
