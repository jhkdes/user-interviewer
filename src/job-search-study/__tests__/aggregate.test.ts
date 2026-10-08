import { describe, expect, it } from "vitest";
import { aggregateRuns } from "../ledger/aggregate";
import type { BehaviorEvidence, EvidenceLedger } from "../ledger/types";
import { loadRubric } from "../rubric/rubric";
import { blankLedger, withEntry } from "./ledger-helpers";

const rubric = loadRubric();

function rated(
  id: BehaviorEvidence["id"],
  score: 0 | 1 | 2 | 3 | 4,
  basis: BehaviorEvidence["evidenceBasis"] = "concrete_example",
): BehaviorEvidence {
  return {
    id,
    status: "rated",
    score,
    evidenceBasis: basis,
    subSignals: [],
    quotes: [{ turnIndex: 1, text: `quote for score ${score}` }],
    confidenceNote: null,
    trajectoryNote: null,
    statusReason: null,
  };
}

const ledgerWith = (...entries: BehaviorEvidence[]): EvidenceLedger =>
  entries.reduce((ledger, entry) => withEntry(ledger, entry), blankLedger(rubric));

const find = (result: ReturnType<typeof aggregateRuns>, id: string) =>
  result.behaviors.find((b) => b.id === id)!;

describe("aggregateRuns", () => {
  it("requires at least one run", () => {
    expect(() => aggregateRuns(rubric, [])).toThrow();
  });

  it("agrees without a flag when the runs match", () => {
    const result = aggregateRuns(rubric, [
      ledgerWith(rated("F1", 3)),
      ledgerWith(rated("F1", 3)),
      ledgerWith(rated("F1", 3)),
    ]);

    expect(find(result, "F1")).toMatchObject({
      status: "rated",
      score: 3,
      spread: 0,
      lowConfidence: false,
    });
  });

  it("takes the lower median and does not flag a one-point spread", () => {
    const result = aggregateRuns(rubric, [
      ledgerWith(rated("F1", 2)),
      ledgerWith(rated("F1", 3)),
      ledgerWith(rated("F1", 3)),
    ]);

    expect(find(result, "F1")).toMatchObject({ score: 3, spread: 1, lowConfidence: false });
  });

  it("flags a spread of two or more", () => {
    const result = aggregateRuns(rubric, [
      ledgerWith(rated("F2", 1)),
      ledgerWith(rated("F2", 2)),
      ledgerWith(rated("F2", 4)),
    ]);

    const f2 = find(result, "F2");
    expect(f2.score).toBe(2);
    expect(f2.spread).toBe(3);
    expect(f2.lowConfidence).toBe(true);
    expect(f2.lowConfidenceReasons[0]).toMatch(/differ by 3/);
  });

  it("uses the lower median for an even number of runs", () => {
    const result = aggregateRuns(rubric, [ledgerWith(rated("F1", 2)), ledgerWith(rated("F1", 3))]);

    expect(find(result, "F1").score).toBe(2);
  });

  it("flags and resolves a status disagreement by majority", () => {
    const result = aggregateRuns(rubric, [
      ledgerWith(rated("R2", 3)),
      ledgerWith(rated("R2", 3)),
      blankLedger(rubric),
    ]);

    const r2 = find(result, "R2");
    expect(r2.status).toBe("rated");
    expect(r2.lowConfidence).toBe(true);
    expect(r2.lowConfidenceReasons[0]).toMatch(/disagree on status/);
  });

  it("falls back to insufficient evidence on a status tie", () => {
    const result = aggregateRuns(rubric, [ledgerWith(rated("R2", 3)), blankLedger(rubric)]);

    expect(find(result, "R2").status).toBe("insufficient_evidence");
  });

  it("keeps the most conservative evidence basis among runs at the median score", () => {
    const result = aggregateRuns(rubric, [
      ledgerWith(rated("P2", 3, "concrete_example")),
      ledgerWith(rated("P2", 3, "estimated_pattern")),
      ledgerWith(rated("P2", 3, "concrete_example")),
    ]);

    expect(find(result, "P2").evidenceBasis).toBe("estimated_pattern");
  });

  it("is unflagged and unscored when every run says insufficient", () => {
    const result = aggregateRuns(rubric, [blankLedger(rubric), blankLedger(rubric)]);

    expect(find(result, "L3")).toMatchObject({
      status: "insufficient_evidence",
      score: null,
      lowConfidence: false,
    });
  });

  it("reports differences in numeric facts", () => {
    const a = blankLedger(rubric);
    const b = blankLedger(rubric);
    a.facts.totalConversations = 5;
    b.facts.totalConversations = 6;
    a.facts.matchRate = { matched: 14, outOf: 20, basis: "estimated_pattern" };
    b.facts.matchRate = { matched: 14, outOf: 20, basis: "estimated_pattern" };

    const result = aggregateRuns(rubric, [a, b]);

    expect(result.factDifferences).toEqual(["Total conversations differs across runs: 5 | 6"]);
  });
});
