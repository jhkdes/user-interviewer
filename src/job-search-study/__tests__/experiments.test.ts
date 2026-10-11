import { describe, expect, it } from "vitest";
import { aggregateRuns } from "../ledger/aggregate";
import type { BehaviorEvidence } from "../ledger/types";
import {
  loadExperimentLibrary,
  priorityDimensions,
  selectExperiments,
  usesAiFrom,
  validateExperimentLibrary,
} from "../report/experiments";
import type { ChannelAnalysis } from "../report/types";
import { loadRubric, type BehaviorId, type Score } from "../rubric/rubric";
import { scoreLedger } from "../scoring/score";
import { blankLedger, withEntry } from "./ledger-helpers";

const rubric = loadRubric();

function rated(id: BehaviorId, score: Score): BehaviorEvidence {
  return {
    id,
    status: "rated",
    score,
    evidenceBasis: "concrete_example",
    subSignals: [],
    quotes: [{ turnIndex: 1, text: "x" }],
    confidenceNote: null,
    trajectoryNote: null,
    statusReason: null,
  };
}

const noChannels: ChannelAnalysis = {
  rows: [],
  totalInterviews: null,
  effortIsNumeric: false,
  mismatches: [],
};

function pick(
  scores: Partial<Record<BehaviorId, Score>>,
  options: { priorityText?: string | null; channels?: ChannelAnalysis; usesAi?: boolean } = {},
) {
  const ledger = Object.entries(scores).reduce(
    (l, [id, score]) => withEntry(l, rated(id as BehaviorId, score as Score)),
    blankLedger(rubric),
  );
  const scoring = scoreLedger(rubric, aggregateRuns(rubric, [ledger]));
  return selectExperiments({
    rubric,
    scoring,
    priorityText: options.priorityText ?? null,
    channels: options.channels ?? noChannels,
    usesAi: options.usesAi ?? true,
  });
}

describe("experiment library", () => {
  it("is valid and has an experiment for every behavior", () => {
    expect(() => loadExperimentLibrary(rubric)).not.toThrow();
  });

  it("flags problems", () => {
    const lib = loadExperimentLibrary(rubric);
    const broken = {
      ...lib,
      experiments: [
        { ...lib.experiments[0], steps: ["only one"] },
        { ...lib.experiments[1], behavior: "Z9" as never },
        lib.experiments[1],
      ],
    };

    const errors = validateExperimentLibrary(rubric, broken).join("\n");

    expect(errors).toMatch(/needs 3 to 5 steps/);
    expect(errors).toMatch(/unknown behavior Z9/);
    expect(errors).toMatch(/duplicate experiment id/);
    expect(errors).toMatch(/no experiment for P3/);
  });
});

describe("priorityDimensions", () => {
  it("reads which dimensions a statement of need points to", () => {
    expect(priorityDimensions("how to get more human conversations and referrals")).toEqual([
      "reach",
    ]);
    expect(priorityDimensions("my resume does not stand out")).toEqual(["pitch"]);
    expect(priorityDimensions("I want to track what works")).toEqual(["learn"]);
    expect(priorityDimensions("finding the right roles before everyone else applies")).toEqual([
      "focus",
    ]);
  });

  it("does not boost anything for a generic wish to get interviews", () => {
    expect(priorityDimensions("how to get more interviews")).toEqual([]);
    expect(priorityDimensions(null)).toEqual([]);
  });
});

describe("selectExperiments", () => {
  it("picks one experiment per dimension, weakest and heaviest first", () => {
    // Need = (4 - score) * weight. P1: 3*50 = 150. R2: 2*45 = 90. F3: 2*30 = 60.
    const result = pick({ F1: 4, F2: 4, F3: 2, P1: 1, R1: 3, R2: 2, L1: 3, L2: 3, L3: 3 });

    expect(result.map((e) => e.forBehavior)).toEqual(["P1", "R2", "F3"]);
  });

  it("boosts the dimension the participant said they want help with", () => {
    // Without a priority, P1 (150) outranks R2 (135). A reach priority adds 60 to R2.
    const scores = { F1: 4, F2: 4, F3: 3, P1: 1, R1: 3, R2: 1, L1: 3, L2: 3, L3: 3 } as const;

    expect(pick(scores).map((e) => e.forBehavior)[0]).toBe("P1");
    const boosted = pick(scores, { priorityText: "how to get human conversations" });
    expect(boosted.map((e) => e.forBehavior)[0]).toBe("R2");
    expect(boosted[0].reason).toMatch(/most want help with/);
  });

  it("fills spare slots from a dimension that already has a pick", () => {
    // Only Pitch has weak behaviors: P1, P2, P3 all 1.
    const result = pick({
      F1: 4,
      F2: 4,
      F3: 4,
      P1: 1,
      P2: 1,
      P3: 1,
      R1: 4,
      R2: 4,
      L1: 4,
      L2: 4,
      L3: 4,
    });

    // P1 needs 150 (3 x weight 50), P2 needs 90, P3 needs 60.
    expect(result.map((e) => e.forBehavior)).toEqual(["P1", "P2", "P3"]);
  });

  it("suggests nothing when no behavior is at 2 or below", () => {
    expect(pick({ F1: 4, F2: 3, F3: 3, P1: 3, R1: 3, R2: 3, L1: 3, L2: 3, L3: 3 })).toEqual([]);
  });

  it("ignores behaviors with no evidence", () => {
    expect(pick({ F1: 4 })).toEqual([]);
  });

  it("boosts effort and reach experiments when time and results do not line up", () => {
    const mismatch: ChannelAnalysis = {
      rows: [],
      totalInterviews: 10,
      effortIsNumeric: true,
      mismatches: [
        {
          kind: "effort_exceeds_yield",
          source: "cold_application",
          interviewSharePercent: 10,
          effortPercent: 70,
        },
      ],
    };
    // F3 = 2 (need 60) would beat L2 = 2 (need 80)? L2 weight 40 -> 80 already; use R1 = 0 (need 120) vs F3 = 2 (need 60).
    const without = pick({
      F3: 2,
      R1: 0,
      L2: 4,
      P1: 4,
      P2: 4,
      P3: 4,
      F1: 4,
      F2: 4,
      R2: 4,
      L1: 4,
      L3: 4,
    });
    const withMismatch = pick(
      { F3: 2, R1: 0, L2: 4, P1: 4, P2: 4, P3: 4, F1: 4, F2: 4, R2: 4, L1: 4, L3: 4 },
      { channels: mismatch },
    );

    expect(without.map((e) => e.forBehavior)).toEqual(["R1", "F3"]);
    expect(withMismatch[0].reason).toMatch(/time and your results do not line up/);
  });

  it("skips the AI experiment for someone who has not used AI", () => {
    const result = pick(
      { F1: 4, F2: 4, F3: 4, P1: 4, P2: 4, P3: 1, R1: 4, R2: 4, L1: 4, L2: 4, L3: 4 },
      { usesAi: false },
    );

    expect(result).toEqual([]);
  });

  it("returns at most three", () => {
    const all = Object.fromEntries(rubric.behaviors.map((b) => [b.id, 1])) as Record<
      BehaviorId,
      Score
    >;

    expect(pick(all)).toHaveLength(3);
  });
});

describe("usesAiFrom", () => {
  it("is false only when P3 is not applicable", () => {
    const applicable = aggregateRuns(rubric, [withEntry(blankLedger(rubric), rated("P3", 3))]);
    const notApplicable = aggregateRuns(rubric, [
      withEntry(blankLedger(rubric), {
        ...rated("P3", 0),
        status: "not_applicable",
        score: null,
        evidenceBasis: null,
        statusReason: "no AI",
      }),
    ]);

    expect(usesAiFrom(applicable)).toBe(true);
    expect(usesAiFrom(notApplicable)).toBe(false);
  });
});
