import { describe, expect, it } from "vitest";
import { aggregateRuns } from "../ledger/aggregate";
import type { BehaviorEvidence } from "../ledger/types";
import { loadRubric, type BehaviorId, type EvidenceBasis, type Score } from "../rubric/rubric";
import { scoreLedger } from "../scoring/score";
import { blankLedger, withEntry } from "./ledger-helpers";

const rubric = loadRubric();

function rated(
  id: BehaviorId,
  score: Score,
  basis: EvidenceBasis = "concrete_example",
): BehaviorEvidence {
  return {
    id,
    status: "rated",
    score,
    evidenceBasis: basis,
    subSignals: [],
    quotes: [{ turnIndex: 1, text: "x" }],
    confidenceNote: null,
    trajectoryNote: null,
    statusReason: null,
  };
}

function notApplicable(id: BehaviorId): BehaviorEvidence {
  return {
    ...rated(id, 0),
    status: "not_applicable",
    score: null,
    evidenceBasis: null,
    statusReason: "n/a",
  };
}

function score(...entries: BehaviorEvidence[]) {
  const ledger = entries.reduce((l, e) => withEntry(l, e), blankLedger(rubric));
  return scoreLedger(rubric, aggregateRuns(rubric, [ledger]));
}

const dimension = (result: ReturnType<typeof score>, id: string) =>
  result.dimensions.find((d) => d.id === id)!;
const behavior = (result: ReturnType<typeof score>, id: string) =>
  result.behaviors.find((b) => b.id === id)!;

describe("evidence caps", () => {
  it("caps an estimated pattern at 3", () => {
    const result = score(rated("L1", 4, "estimated_pattern"));

    expect(behavior(result, "L1")).toMatchObject({ rawScore: 4, score: 3, capped: true, cap: 3 });
  });

  it("caps a self-rating at 2", () => {
    expect(behavior(score(rated("L1", 4, "self_rating")), "L1")).toMatchObject({
      score: 2,
      capped: true,
    });
  });

  it("does not cap concrete evidence", () => {
    expect(behavior(score(rated("L1", 4)), "L1")).toMatchObject({ score: 4, capped: false });
  });

  it("does not cap F2 for a qualitative answer, but still caps a bare self-rating", () => {
    expect(behavior(score(rated("F2", 4, "estimated_pattern")), "F2")).toMatchObject({
      score: 4,
      capped: false,
    });
    expect(behavior(score(rated("F2", 4, "general_description")), "F2")).toMatchObject({
      score: 4,
      capped: false,
    });
    expect(behavior(score(rated("F2", 4, "self_rating")), "F2")).toMatchObject({
      score: 2,
      capped: true,
    });
  });

  it("still caps estimates on other behaviors", () => {
    expect(behavior(score(rated("L1", 4, "estimated_pattern")), "L1")).toMatchObject({
      score: 3,
      capped: true,
    });
  });

  it("does not raise a score below the cap", () => {
    expect(behavior(score(rated("L1", 1, "self_rating")), "L1")).toMatchObject({
      score: 1,
      capped: false,
    });
  });
});

describe("behavior outcomes and labels", () => {
  it("labels by the capped score", () => {
    expect(behavior(score(rated("F1", 4, "self_rating")), "F1").label).toEqual({
      id: "developing",
      text: "Developing",
    });
    expect(behavior(score(rated("F1", 3)), "F1").label).toEqual({
      id: "doing_well",
      text: "Doing well",
    });
    expect(behavior(score(rated("F1", 1)), "F1").label).toEqual({
      id: "opportunity",
      text: "Opportunity",
    });
  });

  it("leaves unscored behaviors without a score or label", () => {
    const result = score(notApplicable("P4"));

    expect(behavior(result, "P4")).toMatchObject({
      outcome: "not_applicable",
      score: null,
      label: null,
    });
    expect(behavior(result, "F1")).toMatchObject({ outcome: "insufficient_evidence", score: null });
  });
});

describe("dimension scores", () => {
  it("computes a weighted score over rated behaviors", () => {
    // Focus weights: F1 25, F2 45, F3 30. Scores 4, 2, 3 -> (25 + 22.5 + 22.5) / 100 = 70
    const result = score(rated("F1", 4), rated("F2", 2), rated("F3", 3));

    expect(dimension(result, "focus")).toMatchObject({ status: "rated", score: 70 });
    expect(dimension(result, "focus").band).toEqual({ id: "strong", text: "Strong" });
  });

  it("renormalizes when a non-must-have behavior has no evidence", () => {
    // F1 (standard) missing; F2 = 4 (45), F3 = 2 (30): (45 + 15) / 75 = 80
    const result = score(rated("F2", 4), rated("F3", 2));

    expect(dimension(result, "focus")).toMatchObject({ status: "rated", score: 80 });
  });

  it("assigns bands at the cutoffs", () => {
    // Reach: R1 50, R2 50. 3 and 3 = 75 (strong); 2 and 2 = 50 (developing); 1 and 1 = 25 (opportunity)
    expect(dimension(score(rated("R1", 3), rated("R2", 3)), "reach").band!.id).toBe("strong");
    expect(dimension(score(rated("R1", 2), rated("R2", 2)), "reach").band!.id).toBe("developing");
    expect(dimension(score(rated("R1", 1), rated("R2", 1)), "reach").band!.id).toBe("opportunity");
  });

  it("is not rated when a must-have behavior has no evidence", () => {
    // Focus: F1 and F3 rated (60% of weight) but F2 is a must-have with no evidence.
    const result = score(rated("F1", 3), rated("F3", 3));

    expect(dimension(result, "focus")).toMatchObject({
      status: "not_rated",
      score: null,
      band: null,
    });
    expect(dimension(result, "focus").notRatedReason).toMatch(/must-have behavior F2/);
  });

  it("is not rated when too little of the weight has evidence", () => {
    // Pitch: only P2 (20%) rated, and the must-have P1 is missing.
    const result = score(rated("P2", 3));

    expect(dimension(result, "pitch").status).toBe("not_rated");
  });

  it("is not rated when the evidenced share is below the minimum, even with must-haves present", () => {
    // Reach with only R1 (must-have, 30%) scored is below the minimum; R1 with R3 (55%) is rated.
    expect(dimension(score(rated("R1", 3)), "reach").status).toBe("not_rated");
    expect(dimension(score(rated("R1", 3), rated("R3", 3)), "reach").status).toBe("rated");
    // Learn: L1 (must-have, 30%) alone is 30% of the weight, below 50%.
    const result = score(rated("L1", 3));
    expect(dimension(result, "learn")).toMatchObject({ status: "not_rated" });
    expect(dimension(result, "learn").notRatedReason).toMatch(/Only 30%/);
  });

  it("drops a not-applicable behavior from the weight", () => {
    // Pitch: P4 not applicable. Remaining weights 40 + 20 + 20 = 80. P1 = 4, P2 = 2, P3 = 2 -> (40 + 10 + 10) / 80 = 75
    const result = score(rated("P1", 4), rated("P2", 2), rated("P3", 2), notApplicable("P4"));

    expect(dimension(result, "pitch")).toMatchObject({
      status: "rated",
      score: 75,
      evidencedWeightShare: 1,
    });
  });

  it("scores from the capped value, not the raw one", () => {
    // R1 = 4 but estimated (cap 3), R2 = 4 and R3 = 4 concrete -> (3*30 + 4*45 + 4*25) / (4*100) = 92.5
    const result = score(rated("R1", 4, "estimated_pattern"), rated("R2", 4), rated("R3", 4));

    expect(dimension(result, "reach").score).toBe(92.5);
  });

  it("weights Reach as R1 30, R2 45, R3 25", () => {
    // R1 = 4 alone would be 100; R3 = 0 with R1 = 4 and R2 = 4 -> (4*30 + 4*45) / 400 * 100 = 75
    const result = score(rated("R1", 4), rated("R2", 4), rated("R3", 0));

    expect(dimension(result, "reach").score).toBe(75);
  });
});

describe("near a band boundary", () => {
  it("is flagged within five points of a cutoff and not otherwise", () => {
    // Reach: R1 30, R2 45. 3 and 2 = 60 (cutoffs 45 and 70: 10 from 70, 15 from 45) -> not near.
    expect(dimension(score(rated("R1", 3), rated("R2", 2)), "reach").nearBandBoundary).toBe(false);
    // Learn: L1 30, L2 40, L3 30 with 3, 3, 2 = 67.5 -> 2.5 from 70 -> near.
    expect(
      dimension(score(rated("L1", 3), rated("L2", 3), rated("L3", 2)), "learn").nearBandBoundary,
    ).toBe(true);
    // Reach 2 and 2 = 50 -> 5 from 45 -> near.
    expect(dimension(score(rated("R1", 2), rated("R2", 2)), "reach").nearBandBoundary).toBe(true);
  });

  it("is false when the dimension is not rated", () => {
    expect(dimension(score(rated("L1", 3)), "learn").nearBandBoundary).toBe(false);
  });
});

describe("strength and improvement picks", () => {
  it("picks the highest behavior at 3 or more and the lowest at 2 or less", () => {
    const result = score(rated("F1", 4), rated("F2", 1), rated("F3", 3));

    const focus = dimension(result, "focus");
    expect(focus.strength).toBe("F1");
    expect(focus.improvement).toBe("F2");
  });

  it("picks the heaviest behavior as the improvement among tied lowest scores", () => {
    // Pitch: P1 (40), P2 (20), P3 (20) all 1. The improvement is P1, the heaviest.
    const result = score(rated("P1", 1), rated("P2", 1), rated("P3", 1), rated("P4", 3));

    expect(dimension(result, "pitch").improvement).toBe("P1");
  });

  it("breaks ties by weight", () => {
    // F2 (weight 40) and F3 (weight 30) both 3: the heavier one is the strength.
    const result = score(rated("F1", 2), rated("F2", 3), rated("F3", 3));

    expect(dimension(result, "focus").strength).toBe("F2");
  });

  it("has no strength when nothing reaches 3, and no improvement when nothing is 2 or less", () => {
    const low = dimension(score(rated("R1", 2), rated("R2", 1)), "reach");
    expect(low.strength).toBeNull();
    expect(low.improvement).toBe("R2");

    const high = dimension(score(rated("R1", 4), rated("R2", 3)), "reach");
    expect(high.improvement).toBeNull();
    expect(high.strength).toBe("R1");
  });
});

describe("low confidence", () => {
  it("carries the aggregation's flag onto the behavior and its dimension", () => {
    const ledgers = [1, 2, 4].map((n) => withEntry(blankLedger(rubric), rated("R1", n as Score)));

    const result = scoreLedger(rubric, aggregateRuns(rubric, ledgers));

    expect(behavior(result, "R1")).toMatchObject({ lowConfidence: true });
    expect(dimension(result, "reach").hasLowConfidenceBehavior).toBe(true);
    expect(dimension(result, "focus").hasLowConfidenceBehavior).toBe(false);
  });
});
