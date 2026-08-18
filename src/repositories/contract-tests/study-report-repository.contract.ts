import { describe, expect, it } from "vitest";
import type { StudyReportRepository } from "../study-report-repository";
import { NONEXISTENT_ID } from "./nonexistent-id";

/**
 * `getStudyId` must resolve to a study that already exists in whatever
 * backing store the repository under test uses. It's a getter rather than a
 * plain string so the Supabase suite can create its fixture study in
 * `beforeAll`, after this function has registered the `it()`s.
 */
export function runStudyReportRepositoryContractTests(
  makeRepository: () => StudyReportRepository | Promise<StudyReportRepository>,
  getStudyId: () => string,
) {
  describe("StudyReportRepository contract", () => {
    it("creates the first report at version 1", async () => {
      const repo = await makeRepository();
      const report = await repo.create({
        studyId: getStudyId(),
        themes: [{ theme: "Manual reporting", participantCount: 3, representativeQuotes: [] }],
      });

      expect(report.id).toBeTruthy();
      expect(report.studyId).toBe(getStudyId());
      expect(report.version).toBe(1);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it("increments the version on each subsequent create for the same study", async () => {
      const repo = await makeRepository();
      const studyId = getStudyId();
      await repo.create({ studyId, themes: [] });
      const second = await repo.create({ studyId, themes: [] });
      const third = await repo.create({ studyId, themes: [] });

      expect(second.version).toBe(2);
      expect(third.version).toBe(3);
    });

    it("getLatestByStudyId returns the highest-version report", async () => {
      const repo = await makeRepository();
      const studyId = getStudyId();
      await repo.create({
        studyId,
        themes: [{ theme: "v1", participantCount: 1, representativeQuotes: [] }],
      });
      await repo.create({
        studyId,
        themes: [{ theme: "v2", participantCount: 2, representativeQuotes: [] }],
      });

      const latest = await repo.getLatestByStudyId(studyId);
      expect(latest?.version).toBe(2);
      expect(latest?.themes[0].theme).toBe("v2");
    });

    it("getLatestByStudyId returns null when no report exists yet", async () => {
      const repo = await makeRepository();
      expect(await repo.getLatestByStudyId(NONEXISTENT_ID)).toBeNull();
    });

    it("listByStudyId returns every version", async () => {
      const repo = await makeRepository();
      const studyId = getStudyId();
      await repo.create({ studyId, themes: [] });
      await repo.create({ studyId, themes: [] });

      const reports = await repo.listByStudyId(studyId);
      expect(reports.map((r) => r.version).sort()).toEqual([1, 2]);
    });
  });
}
