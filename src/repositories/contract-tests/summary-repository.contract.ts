import { describe, expect, it } from "vitest";
import type { SummaryRepository } from "../summary-repository";
import { NONEXISTENT_ID } from "./nonexistent-id";

/**
 * `getInterviewId` must resolve to an interview that already exists in
 * whatever backing store the repository under test uses. It's a getter
 * rather than a plain string so the Supabase suite can create its fixture
 * interview in `beforeAll`, after this function has registered the `it()`s.
 */
export function runSummaryRepositoryContractTests(
  makeRepository: () => SummaryRepository | Promise<SummaryRepository>,
  getInterviewId: () => string,
) {
  describe("SummaryRepository contract", () => {
    it("creates a summary for an interview", async () => {
      const repo = await makeRepository();
      const interviewId = getInterviewId();
      const summary = await repo.create({
        interviewId,
        painPoints: ["Manual data entry takes hours each week"],
        notableQuotes: ["I basically re-do this in a spreadsheet every Friday"],
        takeaways: ["Strong candidate for automation"],
      });

      expect(summary.id).toBeTruthy();
      expect(summary.interviewId).toBe(interviewId);
      expect(summary.painPoints).toEqual(["Manual data entry takes hours each week"]);
      expect(summary.createdAt).toBeInstanceOf(Date);
    });

    it("getByInterviewId returns the created summary", async () => {
      const repo = await makeRepository();
      const interviewId = getInterviewId();
      const created = await repo.create({
        interviewId,
        painPoints: ["pain"],
        notableQuotes: ["quote"],
        takeaways: ["takeaway"],
      });

      const found = await repo.getByInterviewId(interviewId);
      expect(found).toEqual(created);
    });

    it("getByInterviewId returns null when no summary exists yet", async () => {
      const repo = await makeRepository();
      expect(await repo.getByInterviewId(NONEXISTENT_ID)).toBeNull();
    });

    it("defaults type to 'discovery' with empty liked/disliked/suggestions when omitted", async () => {
      const repo = await makeRepository();
      const interviewId = getInterviewId();
      const summary = await repo.create({
        interviewId,
        painPoints: ["pain"],
        notableQuotes: ["quote"],
        takeaways: ["takeaway"],
      });

      expect(summary.type).toBe("discovery");
      expect(summary.liked).toEqual([]);
      expect(summary.disliked).toEqual([]);
      expect(summary.suggestions).toEqual([]);
    });

    it("creates a feedback-type summary with liked/disliked/suggestions and empty discovery fields", async () => {
      const repo = await makeRepository();
      const interviewId = getInterviewId();
      const summary = await repo.create({
        interviewId,
        type: "feedback",
        liked: ["The pacing was great."],
        disliked: ["Audio cut out once."],
        suggestions: ["Double-check the audio setup beforehand."],
      });

      expect(summary.type).toBe("feedback");
      expect(summary.liked).toEqual(["The pacing was great."]);
      expect(summary.disliked).toEqual(["Audio cut out once."]);
      expect(summary.suggestions).toEqual(["Double-check the audio setup beforehand."]);
      expect(summary.painPoints).toEqual([]);
      expect(summary.notableQuotes).toEqual([]);
      expect(summary.takeaways).toEqual([]);

      const reloaded = await repo.getByInterviewId(interviewId);
      expect(reloaded).toEqual(summary);
    });
  });
}
