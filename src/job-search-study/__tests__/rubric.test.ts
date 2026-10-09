import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  behaviorsInDimension,
  getBehavior,
  loadRubric,
  validateRubric,
  type Rubric,
} from "../rubric/rubric";

const rubric = loadRubric();
const scoringModel = readFileSync(
  path.resolve(process.cwd(), "JOB_SEARCH_SCORING_MODEL.md"),
  "utf-8",
);

describe("rubric config", () => {
  it("is internally consistent", () => {
    expect(validateRubric(rubric)).toEqual([]);
  });

  it("defines four dimensions and thirteen behaviors", () => {
    expect(rubric.dimensions.map((d) => d.id)).toEqual(["focus", "pitch", "reach", "learn"]);
    expect(rubric.behaviors.map((b) => b.id)).toEqual([
      "F1",
      "F2",
      "F3",
      "P1",
      "P2",
      "P3",
      "P4",
      "R1",
      "R2",
      "R3",
      "L1",
      "L2",
      "L3",
    ]);
  });

  it("has a must-have behavior in every dimension", () => {
    for (const dimension of rubric.dimensions) {
      const tiers = behaviorsInDimension(rubric, dimension.id).map((b) => b.tier);
      expect(tiers, dimension.id).toContain("must_have");
    }
  });

  it("looks up behaviors by id", () => {
    expect(getBehavior(rubric, "P4").notApplicable).toMatch(/not used AI/);
  });

  describe("validateRubric", () => {
    const clone = (): Rubric => JSON.parse(JSON.stringify(rubric)) as Rubric;

    it("flags weights that do not sum to 100", () => {
      const broken = clone();
      broken.behaviors[0].weight = 99;
      expect(validateRubric(broken).join("\n")).toMatch(/focus: behavior weights sum to 174/);
    });

    it("flags an invalid evidence cap override", () => {
      const broken = clone();
      broken.behaviors[1].evidenceCapOverrides = { estimated_pattern: 9, gut_feeling: 3 } as never;
      const messages = validateRubric(broken);
      expect(messages).toContain("F2: override cap for estimated_pattern out of range");
      expect(messages).toContain("F2: override for unknown evidence basis gut_feeling");
    });

    it("flags a missing anchor", () => {
      const broken = clone();
      broken.behaviors[3].anchors["2"] = " ";
      expect(validateRubric(broken)).toContain("P1: missing anchor 2");
    });

    it("flags bands that are not ordered", () => {
      const broken = clone();
      broken.bands.reverse();
      expect(validateRubric(broken).join("\n")).toMatch(/bands must be listed/);
    });

    it("flags a dimension with no must-have", () => {
      const broken = clone();
      for (const behavior of broken.behaviors) {
        if (behavior.dimension === "reach") behavior.tier = "standard";
      }
      expect(validateRubric(broken)).toContain("reach: no must-have behavior");
    });
  });
});

describe("rubric.json matches JOB_SEARCH_SCORING_MODEL.md", () => {
  const tierFromMarkdown = (cell: string) =>
    /must-have/i.test(cell)
      ? "must_have"
      : /opportunistic/i.test(cell)
        ? "opportunistic"
        : "standard";

  it("has the same weights and tiers as the weights table", () => {
    const rows = [
      ...scoringModel.matchAll(
        /^\|\s*(Focus|Pitch|Reach|Learn)\s*\|\s*([FPRL]\d)\s[^|]+\|\s*(\d+)%\s*\|\s*([^|]+?)\s*\|$/gm,
      ),
    ];
    expect(rows).toHaveLength(13);
    for (const [, , id, weight, tierCell] of rows) {
      const behavior = rubric.behaviors.find((b) => b.id === id);
      expect(behavior, id).toBeDefined();
      expect(behavior!.weight, `${id} weight`).toBe(Number(weight));
      expect(behavior!.tier, `${id} tier`).toBe(tierFromMarkdown(tierCell));
    }
  });

  it("has the same anchors as the behavior rubric tables", () => {
    for (const behavior of rubric.behaviors) {
      const start = scoringModel.indexOf(`#### ${behavior.id}.`);
      expect(start, `${behavior.id} section`).toBeGreaterThan(-1);
      const nextHeading = scoringModel.slice(start + 5).search(/^#{2,4} /m);
      const section = scoringModel.slice(
        start,
        nextHeading === -1 ? undefined : start + 5 + nextHeading,
      );
      for (const key of ["0", "1", "2", "3", "4"] as const) {
        const row = section.match(new RegExp(`^\\|\\s*${key}\\s*\\|\\s*(.+?)\\s*\\|$`, "m"));
        expect(row, `${behavior.id} anchor ${key} in markdown`).not.toBeNull();
        expect(behavior.anchors[key], `${behavior.id} anchor ${key}`).toBe(row![1]);
      }
    }
  });
});
