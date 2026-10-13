import { describe, expect, it } from "vitest";
import { enqueueEligibleReports } from "../pipeline/enqueue";
import { processReport } from "../pipeline/process-report";
import {
  AUTO_RELEASE_ACTOR,
  autoReleaseBlockers,
  autoReleaseEnabled,
} from "../pipeline/auto-release";
import { releaseReport } from "../pipeline/review-actions";
import { MIN_PARTICIPANT_TURNS_FOR_REPORT } from "../min-turns";
import { runSweep } from "../pipeline/sweep";
import { DEFAULT_MIN_PARTICIPANT_TURNS, STALE_AFTER_MS } from "../pipeline/types";
import { loadRubric } from "../rubric/rubric";
import { setup } from "./pipeline-helpers";

describe("enqueueEligibleReports", () => {
  it("queues completed interviews in job-search studies and records ones that are too short as failed, with the reason", async () => {
    const f = await setup();
    const long = await f.addInterview(20);
    const short = await f.addInterview(3);

    const summary = await enqueueEligibleReports(f.deps);

    expect(summary).toEqual({ enqueued: 1, skipped: 1 });
    expect((await f.reportRepo.getByInterviewId(long))?.status).toBe("pending");
    const tooShort = await f.reportRepo.getByInterviewId(short);
    expect(tooShort?.status).toBe("failed");
    expect(tooShort?.error).toMatch(
      /Interview too short for a report: 3 participant turns \(needs at least 14\)/,
    );
  });

  it("ignores interviews that are not completed", async () => {
    const f = await setup();
    const interview = await f.interviewRepo.create({
      studyId: f.studyId,
      firstName: "Sam",
      email: "sam@example.com",
    });
    await f.interviewRepo.update(interview.id, { status: "in-progress" });

    expect(await enqueueEligibleReports(f.deps)).toEqual({ enqueued: 0, skipped: 0 });
  });

  it("ignores studies that do not use the job-search pipeline", async () => {
    const f = await setup({ reportPipeline: null });
    await f.addInterview(20);

    expect(await enqueueEligibleReports(f.deps)).toEqual({ enqueued: 0, skipped: 0 });
    expect(await f.reportRepo.listByStudyId(f.studyId)).toEqual([]);
  });

  it("is safe to run repeatedly: one report per interview", async () => {
    const f = await setup();
    await f.addInterview(20);

    await enqueueEligibleReports(f.deps);
    const again = await enqueueEligibleReports(f.deps);

    expect(again).toEqual({ enqueued: 0, skipped: 0 });
    expect(await f.reportRepo.listByStudyId(f.studyId)).toHaveLength(1);
  });

  it("honors a custom minimum number of turns", async () => {
    const f = await setup();
    await f.addInterview(3);

    const summary = await enqueueEligibleReports({ ...f.deps, minParticipantTurns: 2 });

    expect(summary).toEqual({ enqueued: 1, skipped: 0 });
  });
});

describe("the minimum interview length", () => {
  it("is 14 participant turns, shared with the interview page", () => {
    expect(MIN_PARTICIPANT_TURNS_FOR_REPORT).toBe(14);
    expect(DEFAULT_MIN_PARTICIPANT_TURNS).toBe(MIN_PARTICIPANT_TURNS_FOR_REPORT);
  });

  it("fails an interview one turn short of it and queues one that reaches it", async () => {
    const f = await setup();
    const thirteen = await f.addInterview(13, "Thirteen");
    const fourteen = await f.addInterview(14, "Fourteen");

    const summary = await enqueueEligibleReports(f.deps);

    expect(summary).toEqual({ enqueued: 1, skipped: 1 });
    const short = (await f.reportRepo.getByInterviewId(thirteen))!;
    expect(short.status).toBe("failed");
    expect(short.error).toMatch(/13 participant turns \(needs at least 14\)/);
    expect((await f.reportRepo.getByInterviewId(fourteen))?.status).toBe("pending");
  });

  it("is never retried by the sweep, but can be run anyway once a reviewer wipes it", async () => {
    const f = await setup();
    const eight = await f.addInterview(8);
    await enqueueEligibleReports(f.deps);

    expect((await runSweep(f.deps)).processed).toBeNull();

    const failed = (await f.reportRepo.getByInterviewId(eight))!;
    await f.reportRepo.update(failed.id, { status: "pending", error: null });
    expect((await runSweep(f.deps)).processed).toEqual({ reportId: failed.id, outcome: "draft" });
  });
});

describe("processReport", () => {
  async function claimed(f: Awaited<ReturnType<typeof setup>>) {
    const interviewId = await f.addInterview(20);
    await f.reportRepo.enqueue({ interviewId, studyId: f.studyId });
    return (await f.reportRepo.claimNext({ staleBefore: new Date(0) }))!;
  }

  it("produces a draft report with scores, evidence, and a rubric version", async () => {
    const f = await setup();

    const result = await processReport(f.deps, await claimed(f));

    expect(result.status).toBe("draft");
    expect(result.error).toBeNull();
    expect(result.attempts).toBe(1);
    expect(result.rubricVersion).toBe(loadRubric().version);
    expect(result.extractionRuns).toHaveLength(3);
    expect(result.aggregate?.runs).toBe(3);
    expect(result.scoring?.dimensions.map((d) => d.id)).toEqual([
      "focus",
      "pitch",
      "reach",
      "learn",
    ]);
    expect(result.report?.executiveSummary).toMatch(/clear about what you want/);
    expect(result.generatedReport).toEqual(result.report);
    expect(result.narrativeViolations).toEqual([]);
    expect(result.comparison).toBeDefined();
    expect(f.model.calls).toEqual({ extraction: 3, narrative: 1 });
  });

  it("keeps going when one extraction run fails, as long as enough valid runs remain", async () => {
    const f = await setup({ model: { failExtractionCalls: 1 } });

    const result = await processReport(f.deps, await claimed(f));

    expect(result.status).toBe("draft");
    expect(result.extractionRuns).toHaveLength(2);
  });

  it("does not reuse saved extraction runs from a different rubric version", async () => {
    const f = await setup();
    const interviewId = await f.addInterview(20);
    await f.reportRepo.enqueue({ interviewId, studyId: f.studyId });
    const first = await processReport(
      f.deps,
      (await f.reportRepo.claimNext({ staleBefore: new Date(0) }))!,
    );
    const stale = first.extractionRuns.map((run) => ({ ...run, rubricVersion: "0.4.0" }));
    const callsBefore = f.model.calls.extraction;

    const result = await processReport(f.deps, {
      ...first,
      status: "generating",
      extractionRuns: stale,
    });

    expect(result.status).toBe("draft");
    expect(f.model.calls.extraction).toBe(callsBefore + 3);
    expect(result.extractionRuns.every((run) => run.rubricVersion === loadRubric().version)).toBe(
      true,
    );
  });

  it("fails with the reason when too few extraction runs are valid", async () => {
    const f = await setup({ model: { failExtractionCalls: 2 } });

    const result = await processReport(f.deps, await claimed(f));

    expect(result.status).toBe("failed");
    expect(result.error).toMatch(/Extraction produced 1 valid run\(s\); at least 2 are needed/);
    expect(result.error).toMatch(/extraction model down/);
    expect(result.attempts).toBe(1);
    // The one good run is kept, so a retry only pays for the missing ones.
    expect(result.extractionRuns).toHaveLength(1);
  });

  it("fails with the reason when the narrative model is down, keeping the extraction runs", async () => {
    const f = await setup({ model: { failNarrative: true } });

    const result = await processReport(f.deps, await claimed(f));

    expect(result.status).toBe("failed");
    expect(result.error).toBe("narrative model down");
    expect(result.extractionRuns).toHaveLength(3);
  });

  it("resumes from saved extraction runs without calling the extractor again", async () => {
    const f = await setup({ model: { failNarrative: true } });
    const first = await processReport(f.deps, await claimed(f));
    expect(first.status).toBe("failed");
    const extractionCallsBefore = f.model.calls.extraction;

    // Narrative model recovers: retry the same report with its saved runs.
    const recovered = await setupWith(f, {});
    const retried = await processReport(recovered, { ...first, status: "generating" });

    expect(retried.status).toBe("draft");
    expect(f.model.calls.extraction).toBe(extractionCallsBefore);
    expect(retried.attempts).toBe(2);
  });

  it("records rule violations in the narrative without failing the report", async () => {
    const f = await setup({ model: { executiveSummary: "He has a clear target." } });

    const result = await processReport(f.deps, await claimed(f));

    expect(result.status).toBe("draft");
    expect(result.narrativeViolations.join("\n")).toMatch(
      /executiveSummary uses a gendered pronoun/,
    );
  });

  it("fails when the interview has no transcript", async () => {
    const f = await setup();
    const interviewId = await f.addInterview(20);
    await f.interviewRepo.update(interviewId, { transcript: [] });
    await f.reportRepo.enqueue({ interviewId, studyId: f.studyId });
    const claimedReport = (await f.reportRepo.claimNext({ staleBefore: new Date(0) }))!;

    const result = await processReport(f.deps, claimedReport);

    expect(result.status).toBe("failed");
    expect(result.error).toBe("The interview has no transcript.");
  });
});

/** The same fixture with a model that works. */
async function setupWith(
  f: Awaited<ReturnType<typeof setup>>,
  options: { failNarrative?: boolean },
) {
  const { makeFakeModel } = await import("./pipeline-helpers");
  const model = makeFakeModel(options);
  // Share call counts with the original model so the test can see whether extraction was called again.
  return {
    ...f.deps,
    complete: async (args: Parameters<typeof model.complete>[0]) => {
      const result = await model.complete(args);
      if (args.toolName !== "write_report") f.model.calls.extraction++;
      return result;
    },
  };
}

describe("runSweep", () => {
  it("queues new interviews and processes one report per pass", async () => {
    const f = await setup();
    await f.addInterview(20, "Avery");
    await f.addInterview(20, "Blake");

    const first = await runSweep(f.deps);
    expect(first.enqueued).toBe(2);
    expect(first.processed?.outcome).toBe("draft");

    const second = await runSweep(f.deps);
    expect(second.enqueued).toBe(0);
    expect(second.processed?.outcome).toBe("draft");

    const third = await runSweep(f.deps);
    expect(third.processed).toBeNull();

    const reports = await f.reportRepo.listByStudyId(f.studyId);
    expect(reports.map((r) => r.status)).toEqual(["draft", "draft"]);
  });

  it("reports a failed report and does not retry it automatically", async () => {
    const f = await setup({ model: { failNarrative: true } });
    await f.addInterview(20);

    const first = await runSweep(f.deps);
    const second = await runSweep(f.deps);

    expect(first.processed?.outcome).toBe("failed");
    expect(second.processed).toBeNull();
  });

  it("picks up a report that was abandoned while generating, once it is stale", async () => {
    let clock = new Date("2026-10-06T12:00:00Z");
    const f = await setup({ now: () => clock });
    const interviewId = await f.addInterview(20);
    const { report } = await f.reportRepo.enqueue({ interviewId, studyId: f.studyId });
    await f.reportRepo.update(report.id, { status: "generating" });

    // Not stale yet: nothing to do.
    expect((await runSweep(f.deps)).processed).toBeNull();

    clock = new Date(clock.getTime() + STALE_AFTER_MS + 1000);
    const later = await runSweep(f.deps);

    expect(later.processed).toEqual({ reportId: report.id, outcome: "draft" });
  });

  it("does nothing when there is nothing to do", async () => {
    const f = await setup();

    expect(await runSweep(f.deps)).toEqual({ enqueued: 0, skipped: 0, processed: null });
  });
});

describe("automatic release", () => {
  /** A sweep that releases clean reports the way the live wiring does. */
  const withAutoRelease = (f: Awaited<ReturnType<typeof setup>>) => ({
    ...f.deps,
    autoRelease: (reportId: string) =>
      releaseReport(f.reviewDeps, reportId, { releasedBy: AUTO_RELEASE_ACTOR }),
  });

  it("releases and emails a clean report with no reviewer", async () => {
    const f = await setup();
    await f.addInterview(20, "Jordan");

    const result = await runSweep(withAutoRelease(f));

    expect(result.autoRelease).toEqual({
      reportId: result.processed!.reportId,
      outcome: "released",
      reasons: [],
    });
    const stored = (await f.reportRepo.getById(result.processed!.reportId))!;
    expect(stored).toMatchObject({ status: "released", releasedBy: AUTO_RELEASE_ACTOR });
    expect(stored.emailSentAt).toBeInstanceOf(Date);
    expect(f.emailClient.sent).toHaveLength(1);
    expect(f.emailClient.sent[0].to).toBe("jordan@example.com");
    expect(f.emailClient.sent[0].attachments?.[0].filename).toBe("Your-Job-Search-Report.pdf");
  });

  it("holds a report with rule violations for a reviewer, and sends nothing", async () => {
    const f = await setup({ model: { executiveSummary: "He has a clear target." } });
    await f.addInterview(20);

    const result = await runSweep(withAutoRelease(f));

    expect(result.autoRelease).toMatchObject({ outcome: "held" });
    expect(result.autoRelease!.reasons.join(" ")).toMatch(/rule violation/);
    expect((await f.reportRepo.getById(result.processed!.reportId))?.status).toBe("draft");
    expect(f.emailClient.sent).toHaveLength(0);
  });

  it("holds a report with a low-confidence rating for a reviewer", async () => {
    const f = await setup({ model: { disagree: true } });
    await f.addInterview(20);

    const result = await runSweep(withAutoRelease(f));

    expect(result.autoRelease).toMatchObject({ outcome: "held" });
    expect(result.autoRelease!.reasons.join(" ")).toMatch(/low-confidence rating for F1/);
    expect((await f.reportRepo.getById(result.processed!.reportId))?.status).toBe("draft");
    expect(f.emailClient.sent).toHaveLength(0);
  });

  it("does not consider release when it is not wired up", async () => {
    const f = await setup();
    await f.addInterview(20);

    const result = await runSweep(f.deps);

    expect(result.autoRelease).toBeUndefined();
    expect((await f.reportRepo.getById(result.processed!.reportId))?.status).toBe("draft");
    expect(f.emailClient.sent).toHaveLength(0);
  });

  it("does not consider release for a report that failed", async () => {
    const f = await setup({ model: { failNarrative: true } });
    await f.addInterview(20);

    const result = await runSweep(withAutoRelease(f));

    expect(result.processed?.outcome).toBe("failed");
    expect(result.autoRelease).toBeUndefined();
  });

  it("keeps the report released and says why when the email cannot be sent", async () => {
    const f = await setup();
    await f.addInterview(20);
    f.emailClient.scriptFailure(new Error("mail server down"));

    const result = await runSweep(withAutoRelease(f));

    expect(result.autoRelease).toMatchObject({
      outcome: "email_failed",
      reasons: ["mail server down"],
    });
    const stored = (await f.reportRepo.getById(result.processed!.reportId))!;
    expect(stored.status).toBe("released");
    expect(stored.emailSentAt).toBeNull();
    expect(stored.error).toMatch(
      /Released automatically, but the email was not sent: mail server down/,
    );
  });

  it("leaves the draft for a reviewer when the release itself throws", async () => {
    const f = await setup();
    await f.addInterview(20);

    const result = await runSweep({
      ...f.deps,
      autoRelease: async () => {
        throw new Error("database unavailable");
      },
    });

    expect(result.autoRelease).toMatchObject({ outcome: "held" });
    expect(result.autoRelease!.reasons[0]).toMatch(/release failed: database unavailable/);
    expect((await f.reportRepo.getById(result.processed!.reportId))?.status).toBe("draft");
  });
});

describe("autoReleaseBlockers", () => {
  async function draft(options: Parameters<typeof setup>[0] = {}) {
    const f = await setup(options);
    await f.addInterview(20);
    const { processed } = await runSweep(f.deps);
    return (await f.reportRepo.getById(processed!.reportId))!;
  }

  it("is empty for a clean draft", async () => {
    expect(autoReleaseBlockers(await draft())).toEqual([]);
  });

  it("lists each reason a report must wait", async () => {
    const violations = await draft({ model: { executiveSummary: "He has a clear target." } });
    expect(autoReleaseBlockers(violations)).toEqual([
      expect.stringMatching(/1 rule violation in the text/),
    ]);

    const lowConfidence = await draft({ model: { disagree: true } });
    expect(autoReleaseBlockers(lowConfidence)).toEqual([
      expect.stringMatching(/low-confidence rating for F1/),
    ]);

    const clean = await draft();
    expect(autoReleaseBlockers({ ...clean, status: "released" })).toEqual([
      expect.stringMatching(/released, not a draft/),
    ]);
    expect(autoReleaseBlockers({ ...clean, report: null })).toEqual([
      expect.stringMatching(/no report content/),
    ]);
  });
});

describe("autoReleaseEnabled", () => {
  it("is on unless turned off", () => {
    expect(autoReleaseEnabled({})).toBe(true);
    expect(autoReleaseEnabled({ AUTO_RELEASE_REPORTS: "" })).toBe(true);
    expect(autoReleaseEnabled({ AUTO_RELEASE_REPORTS: "true" })).toBe(true);
    for (const off of ["false", "FALSE", " 0 ", "no", "off"]) {
      expect(autoReleaseEnabled({ AUTO_RELEASE_REPORTS: off }), off).toBe(false);
    }
  });
});
