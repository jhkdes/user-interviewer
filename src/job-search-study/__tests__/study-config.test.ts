import { describe, expect, it } from "vitest";
import { validateStudyInput } from "@/study-service";
import {
  JOB_SEARCH_SCREENER,
  JOB_SEARCH_STUDY_DESCRIPTION,
  JOB_SEARCH_STUDY_TITLE,
} from "../study-config";

describe("job-search study config", () => {
  it("passes the app's own study input validation", () => {
    const result = validateStudyInput({
      title: JOB_SEARCH_STUDY_TITLE,
      description: JOB_SEARCH_STUDY_DESCRIPTION,
      preInterviewQuestions: JOB_SEARCH_SCREENER,
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("defines the twelve screener questions with unique, stable ids", () => {
    const ids = JOB_SEARCH_SCREENER.map((question) => question.id);

    expect(ids).toEqual([
      "search_status",
      "time_since_full_time",
      "search_duration",
      "target_function",
      "current_level",
      "target_level_vs_recent",
      "applications_30d",
      "conversations_total",
      "channels_used",
      "ai_uses",
      "search_support",
      "career_pivot",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has no duplicate options within a question", () => {
    for (const question of JOB_SEARCH_SCREENER) {
      expect(new Set(question.options).size, question.id).toBe(question.options.length);
    }
  });

  it("splits the job-board source into general boards, niche sources, career pages, and alerts", () => {
    const channels = JOB_SEARCH_SCREENER.find((question) => question.id === "channels_used")!;

    expect(channels.options).toEqual(
      expect.arrayContaining([
        "General job boards (such as LinkedIn or Indeed)",
        "Niche or industry job boards, newsletters, or listings",
        "Company career pages",
        "Job alerts or saved searches",
      ]),
    );
    expect(channels.options).not.toContain("Applying through job boards or company career sites");
  });

  it("uses multi-select exactly for the checklist questions", () => {
    const multi = JOB_SEARCH_SCREENER.filter((question) => question.type === "multi").map(
      (question) => question.id,
    );

    expect(multi).toEqual(["target_function", "channels_used", "ai_uses", "search_support"]);
  });

  it("asks about job-search support and about a career pivot, for research segmentation", () => {
    const support = JOB_SEARCH_SCREENER.find((question) => question.id === "search_support")!;
    const pivot = JOB_SEARCH_SCREENER.find((question) => question.id === "career_pivot")!;

    expect(support.options).toEqual([
      "No support",
      "A paid career coach",
      "Outplacement support paid for by a former employer",
      "A free program (for example, a workforce, alumni, or community program)",
    ]);
    expect(pivot.type).toBe("single");
    expect(pivot.options.filter((option) => option.startsWith("Yes"))).toHaveLength(3);
    expect(pivot.options[0]).toMatch(/^No/);
  });
});
