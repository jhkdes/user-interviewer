import { describe, expect, it } from "vitest";
import { validateLedger } from "../ledger/validate";
import { loadRubric } from "../rubric/rubric";
import type { BehaviorEvidence } from "../ledger/types";
import { blankLedger, SAMPLE_TRANSCRIPT, withEntry } from "./ledger-helpers";

const rubric = loadRubric();

const ratedF2: BehaviorEvidence = {
  id: "F2",
  status: "rated",
  score: 3,
  evidenceBasis: "estimated_pattern",
  subSignals: [{ name: "match rate", observation: "Most of the recent ones" }],
  quotes: [{ turnIndex: 3, text: "most of them, at least the recent ones" }],
  confidenceNote: null,
  trajectoryNote: null,
  statusReason: null,
};

describe("validateLedger", () => {
  it("accepts a blank ledger (every behavior insufficient)", () => {
    const result = validateLedger(rubric, blankLedger(rubric), SAMPLE_TRANSCRIPT);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("accepts a rated behavior with a verifiable quote", () => {
    const result = validateLedger(
      rubric,
      withEntry(blankLedger(rubric), ratedF2),
      SAMPLE_TRANSCRIPT,
    );

    expect(result.ok).toBe(true);
  });

  it("flags a missing behavior", () => {
    const ledger = blankLedger(rubric);
    ledger.behaviors = ledger.behaviors.filter((entry) => entry.id !== "L3");

    const result = validateLedger(rubric, ledger, SAMPLE_TRANSCRIPT);

    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.message)).toContain("Missing entry for L3");
  });

  it("flags a duplicate behavior", () => {
    const ledger = blankLedger(rubric);
    ledger.behaviors.push(ledger.behaviors[0]);

    expect(
      validateLedger(rubric, ledger, SAMPLE_TRANSCRIPT).issues.map((i) => i.message),
    ).toContain("Duplicate entry for F1");
  });

  it("flags a rated behavior with no score or basis", () => {
    const broken = { ...ratedF2, score: null, evidenceBasis: null };

    const result = validateLedger(
      rubric,
      withEntry(blankLedger(rubric), broken),
      SAMPLE_TRANSCRIPT,
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        "F2 is rated but has no score",
        "F2 is rated but has no evidence basis",
      ]),
    );
  });

  it("flags values the tool schema does not strictly enforce", () => {
    const broken = {
      ...ratedF2,
      status: "maybe" as never,
      score: 7 as never,
      evidenceBasis: "gut_feeling" as never,
    };

    const messages = validateLedger(
      rubric,
      withEntry(blankLedger(rubric), broken),
      SAMPLE_TRANSCRIPT,
    ).issues.map((i) => i.message);

    expect(messages).toEqual(
      expect.arrayContaining([
        'F2 has an invalid status "maybe"',
        "F2 has an invalid score 7",
        'F2 has an invalid evidence basis "gut_feeling"',
      ]),
    );
  });

  it("warns about an unknown source id", () => {
    const ledger = blankLedger(rubric);
    ledger.facts.sources = [{ source: "carrier_pigeon" as never, count: 1 }];

    const result = validateLedger(rubric, ledger, SAMPLE_TRANSCRIPT);

    expect(result.ok).toBe(true);
    expect(result.issues.map((i) => i.message)).toContain('Unknown source "carrier_pigeon"');
  });

  it("flags a score on an insufficient behavior", () => {
    const broken = { ...ratedF2, status: "insufficient_evidence" as const, statusReason: "x" };

    const result = validateLedger(
      rubric,
      withEntry(blankLedger(rubric), broken),
      SAMPLE_TRANSCRIPT,
    );

    expect(result.issues.map((i) => i.message)).toContain(
      "F2 has a score but is insufficient_evidence",
    );
  });

  it("allows not_applicable only where the rubric allows it", () => {
    const notApplicable = (id: "P4" | "F1"): BehaviorEvidence => ({
      id,
      status: "not_applicable",
      score: null,
      evidenceBasis: null,
      subSignals: [],
      quotes: [],
      confidenceNote: null,
      trajectoryNote: null,
      statusReason: "Does not apply",
    });

    expect(
      validateLedger(rubric, withEntry(blankLedger(rubric), notApplicable("P4")), SAMPLE_TRANSCRIPT)
        .ok,
    ).toBe(true);
    expect(
      validateLedger(
        rubric,
        withEntry(blankLedger(rubric), notApplicable("F1")),
        SAMPLE_TRANSCRIPT,
      ).issues.map((i) => i.message),
    ).toContain("F1 cannot be not_applicable; use insufficient_evidence");
  });

  it("drops unverifiable quotes with a warning, and errors if a rated behavior is left with none", () => {
    const fabricated = {
      ...ratedF2,
      quotes: [{ turnIndex: 3, text: "I apply to exactly twenty roles a week" }],
    };

    const result = validateLedger(
      rubric,
      withEntry(blankLedger(rubric), fabricated),
      SAMPLE_TRANSCRIPT,
    );

    expect(result.ok).toBe(false);
    expect(result.ledger.behaviors.find((b) => b.id === "F2")!.quotes).toEqual([]);
    expect(result.issues.map((i) => i.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("dropped unverifiable quote"),
        "F2 is rated but has no verifiable quote",
      ]),
    );
  });

  it("re-indexes a quote found in a different turn", () => {
    const misindexed = {
      ...ratedF2,
      quotes: [{ turnIndex: 1, text: "most of them, at least the recent ones" }],
    };

    const result = validateLedger(
      rubric,
      withEntry(blankLedger(rubric), misindexed),
      SAMPLE_TRANSCRIPT,
    );

    expect(result.ok).toBe(true);
    expect(result.ledger.behaviors.find((b) => b.id === "F2")!.quotes[0].turnIndex).toBe(3);
  });

  it("flags impossible and inconsistent facts", () => {
    const ledger = blankLedger(rubric);
    ledger.facts.matchRate = { matched: 15, outOf: 10, basis: "estimated_pattern" };
    ledger.facts.totalConversations = 5;
    ledger.facts.sources = [
      { source: "recruiter_inbound", count: 2 },
      { source: "cold_application", count: 2 },
    ];
    ledger.facts.effortSplit = [
      { source: "cold_application", sharePercent: 80, qualitative: null },
      { source: "referral_from_contact", sharePercent: 60, qualitative: null },
    ];

    const result = validateLedger(rubric, ledger, SAMPLE_TRANSCRIPT);

    expect(result.ok).toBe(false);
    const messages = result.issues.map((i) => i.message);
    expect(messages).toContain("Match rate 15 of 10 is impossible");
    expect(messages).toContain("Effort shares add up to more than 100%");
    expect(messages).toContain("Source counts add up to 4 but the total is 5");
  });

  it("warns when the report priority points at an interviewer turn", () => {
    const ledger = { ...blankLedger(rubric), reportPriority: { text: "x", turnIndex: 0 } };

    const result = validateLedger(rubric, ledger, SAMPLE_TRANSCRIPT);

    expect(result.ok).toBe(true);
    expect(result.issues[0]).toMatchObject({ severity: "warning" });
  });
});
