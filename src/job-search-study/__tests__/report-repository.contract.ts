import { describe, expect, it } from "vitest";
import type { JobSearchReportRepository } from "../storage/types";

/** Ids of an interview (and its study) that exist in whatever store the repository under test uses. Each call returns a fresh pair. */
export type ReportFixture = () => Promise<{ interviewId: string; studyId: string }>;

/** Contract every JobSearchReportRepository must satisfy: the in-memory one and the Supabase one run the same tests. */
export function runJobSearchReportRepositoryContractTests(
  makeRepository: () => JobSearchReportRepository | Promise<JobSearchReportRepository>,
  newFixture: ReportFixture,
) {
  describe("JobSearchReportRepository contract", () => {
    it("enqueues a pending report with empty working data", async () => {
      const repo = await makeRepository();
      const { interviewId, studyId } = await newFixture();

      const { report, created } = await repo.enqueue({ interviewId, studyId });

      expect(created).toBe(true);
      expect(report).toMatchObject({
        interviewId,
        studyId,
        status: "pending",
        extractionRuns: [],
        aggregate: null,
        report: null,
        narrativeViolations: [],
        textViolations: [],
        error: null,
        attempts: 0,
        accessToken: null,
        releasedAt: null,
      });
      expect(report.id).toBeTruthy();
      expect(report.createdAt).toBeInstanceOf(Date);
    });

    it("is idempotent: enqueuing the same interview again returns the existing report", async () => {
      const repo = await makeRepository();
      const { interviewId, studyId } = await newFixture();

      const first = await repo.enqueue({ interviewId, studyId });
      const second = await repo.enqueue({ interviewId, studyId });

      expect(second.created).toBe(false);
      expect(second.report.id).toBe(first.report.id);
    });

    it("records a skipped interview with its reason", async () => {
      const repo = await makeRepository();
      const { interviewId, studyId } = await newFixture();

      const { report } = await repo.enqueue({
        interviewId,
        studyId,
        status: "skipped",
        error: "Too short to analyze",
      });

      expect(report.status).toBe("skipped");
      expect(report.error).toBe("Too short to analyze");
    });

    it("finds a report by id and by interview id, and returns null for unknown ones", async () => {
      const repo = await makeRepository();
      const { interviewId, studyId } = await newFixture();
      const { report } = await repo.enqueue({ interviewId, studyId });

      expect((await repo.getById(report.id))?.id).toBe(report.id);
      expect((await repo.getByInterviewId(interviewId))?.id).toBe(report.id);
      expect(await repo.getById("00000000-0000-0000-0000-000000000000")).toBeNull();
      expect(await repo.getByInterviewId("00000000-0000-0000-0000-000000000000")).toBeNull();
    });

    it("updates only the given fields and round-trips structured data and dates", async () => {
      const repo = await makeRepository();
      const { interviewId, studyId } = await newFixture();
      const { report } = await repo.enqueue({ interviewId, studyId });
      const releasedAt = new Date("2026-10-06T12:00:00.000Z");

      const updated = await repo.update(report.id, {
        status: "released",
        rubricVersion: "0.3.1",
        extractionRuns: [{ rubricVersion: "0.3.1", behaviors: [], conflicts: [] } as never],
        narrativeViolations: ["a rule was broken"],
        accessToken: "token-abc",
        releasedAt,
        releasedBy: "pm@example.com",
        attempts: 2,
      });

      expect(updated).toMatchObject({
        status: "released",
        rubricVersion: "0.3.1",
        narrativeViolations: ["a rule was broken"],
        accessToken: "token-abc",
        releasedBy: "pm@example.com",
        attempts: 2,
        error: null,
      });
      expect(updated.releasedAt?.toISOString()).toBe(releasedAt.toISOString());
      expect(updated.extractionRuns).toHaveLength(1);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(report.updatedAt.getTime());
    });

    it("clears a nullable field when given null", async () => {
      const repo = await makeRepository();
      const { interviewId, studyId } = await newFixture();
      const { report } = await repo.enqueue({ interviewId, studyId });
      await repo.update(report.id, { accessToken: "token-to-clear", error: "boom" });

      const cleared = await repo.update(report.id, { accessToken: null, error: null });

      expect(cleared.accessToken).toBeNull();
      expect(cleared.error).toBeNull();
    });

    it("finds a released report by its access token only", async () => {
      const repo = await makeRepository();
      const { interviewId, studyId } = await newFixture();
      const { report } = await repo.enqueue({ interviewId, studyId });
      const token = `token-${report.id}`;
      await repo.update(report.id, { accessToken: token, status: "released" });

      expect((await repo.getByAccessToken(token))?.id).toBe(report.id);
      expect(await repo.getByAccessToken("not-a-real-token")).toBeNull();
    });

    it("throws when updating a report that does not exist", async () => {
      const repo = await makeRepository();

      await expect(
        repo.update("00000000-0000-0000-0000-000000000000", { status: "draft" }),
      ).rejects.toThrow();
    });

    it("lists a study's reports, newest first", async () => {
      const repo = await makeRepository();
      const a = await newFixture();
      const b = await newFixture();
      // Same study for both, so they list together.
      const first = await repo.enqueue({ interviewId: a.interviewId, studyId: a.studyId });
      await new Promise((resolve) => setTimeout(resolve, 15));
      const second = await repo.enqueue({ interviewId: b.interviewId, studyId: a.studyId });

      const listed = await repo.listByStudyId(a.studyId);

      expect(listed.map((r) => r.id)).toEqual([second.report.id, first.report.id]);
    });

    describe("claimNext", () => {
      it("claims a pending report and marks it generating", async () => {
        const repo = await makeRepository();
        const { interviewId, studyId } = await newFixture();
        const { report } = await repo.enqueue({ interviewId, studyId });

        const claimed = await repo.claimNext({
          staleBefore: new Date(Date.now() - 10 * 60 * 1000),
        });

        expect(claimed?.id).toBe(report.id);
        expect(claimed?.status).toBe("generating");
        expect((await repo.getById(report.id))?.status).toBe("generating");
      });

      it("does not hand out a report that is already being generated and not stale", async () => {
        const repo = await makeRepository();
        const { interviewId, studyId } = await newFixture();
        const { report } = await repo.enqueue({ interviewId, studyId });
        await repo.update(report.id, { status: "generating" });

        const claimed = await repo.claimNext({
          staleBefore: new Date(Date.now() - 10 * 60 * 1000),
        });

        expect(claimed?.id).not.toBe(report.id);
      });

      it("picks up a generating report that has gone stale", async () => {
        const repo = await makeRepository();
        const { interviewId, studyId } = await newFixture();
        const { report } = await repo.enqueue({ interviewId, studyId });
        await repo.update(report.id, { status: "generating" });

        const claimed = await repo.claimNext({ staleBefore: new Date(Date.now() + 60 * 1000) });

        expect(claimed?.id).toBe(report.id);
      });

      it("never claims drafts, released, failed, or skipped reports", async () => {
        const repo = await makeRepository();
        const ids: string[] = [];
        for (const status of ["draft", "released", "failed", "skipped"] as const) {
          const { interviewId, studyId } = await newFixture();
          const { report } = await repo.enqueue({ interviewId, studyId });
          await repo.update(report.id, { status });
          ids.push(report.id);
        }

        const claimed = await repo.claimNext({ staleBefore: new Date(Date.now() + 60 * 1000) });

        expect(claimed === null || !ids.includes(claimed.id)).toBe(true);
      });

      it("hands the same report to only one of two claimers", async () => {
        const repo = await makeRepository();
        const { interviewId, studyId } = await newFixture();
        const { report } = await repo.enqueue({ interviewId, studyId });
        const staleBefore = new Date(Date.now() - 10 * 60 * 1000);

        const results = await Promise.all([
          repo.claimNext({ staleBefore }),
          repo.claimNext({ staleBefore }),
        ]);

        const claimedIds = results.filter((r) => r !== null).map((r) => r!.id);
        expect(claimedIds.filter((id) => id === report.id)).toHaveLength(1);
      });
    });
  });
}
