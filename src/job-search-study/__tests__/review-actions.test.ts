import { describe, expect, it } from "vitest";
import { applyEdits, narrativeOf, recheckViolations } from "../pipeline/edits";
import {
  InvalidReportEditsError,
  InvalidReportStateError,
  ReleaseBlockedError,
  ReportNotFoundError,
} from "../pipeline/errors";
import { renderReportEmail, reportUrl } from "../pipeline/report-email";
import {
  regenerateNarrative,
  releaseReport,
  requeueFromScratch,
  resendReportEmail,
  saveEdits,
  withdrawReport,
} from "../pipeline/review-actions";
import { runSweep } from "../pipeline/sweep";
import { loadRubric } from "../rubric/rubric";
import { setup, type Fixture } from "./pipeline-helpers";

const rubric = loadRubric();

/** A fixture with one interview already turned into a draft report. */
async function withDraft(options: Parameters<typeof setup>[0] = {}) {
  const f = await setup(options);
  await f.addInterview(8, "Jordan");
  const result = await runSweep(f.deps);
  return { f, reportId: result.processed!.reportId };
}

const release = (f: Fixture, reportId: string, extra: { acknowledgeViolations?: boolean } = {}) =>
  releaseReport(f.reviewDeps, reportId, {
    releasedBy: "pm@example.com",
    ...extra,
  });

describe("applyEdits", () => {
  async function currentReport() {
    const { f, reportId } = await withDraft();
    return (await f.reportRepo.getById(reportId))!.report!;
  }

  it("changes only the fields given, trimming whitespace", async () => {
    const report = await currentReport();

    const edited = applyEdits(rubric, report, { bottomLine: "  A clearer takeaway.  " });

    expect(edited.bottomLine).toBe("A clearer takeaway.");
    expect(edited.executiveSummary).toBe(report.executiveSummary);
    expect(edited.dimensions).toEqual(report.dimensions);
  });

  it("edits a dimension's text without touching its band or labels", async () => {
    const report = await currentReport();

    const edited = applyEdits(rubric, report, {
      dimensions: [{ id: "pitch", improvementText: "A sharper note." }],
    });

    const pitch = edited.dimensions.find((d) => d.id === "pitch")!;
    const before = report.dimensions.find((d) => d.id === "pitch")!;
    expect(pitch.improvementText).toBe("A sharper note.");
    expect(pitch.strengthText).toBe(before.strengthText);
    expect(pitch.band).toBe(before.band);
    expect(pitch.behaviors).toEqual(before.behaviors);
  });

  it("clears the priority when given an empty one", async () => {
    const report = await currentReport();

    expect(applyEdits(rubric, report, { priority: "  " }).priority).toBeNull();
    expect(applyEdits(rubric, report, { priority: "Better outreach" }).priority).toBe(
      "Better outreach",
    );
  });

  it("rejects empty required text and unknown dimensions", async () => {
    const report = await currentReport();

    expect(() => applyEdits(rubric, report, { executiveSummary: "  " })).toThrow(
      InvalidReportEditsError,
    );
    expect(() =>
      applyEdits(rubric, report, { dimensions: [{ id: "nope" as never, strengthText: "x" }] }),
    ).toThrow(/Unknown dimension nope/);
  });

  it("replaces the experiments from the library, keeping the reason for ones already chosen", async () => {
    const report = applyEdits(rubric, await currentReport(), {
      experimentIds: ["l2-rebalance-the-week"],
    });
    const kept = report.experiments[0];

    const edited = applyEdits(rubric, report, { experimentIds: [kept.id, "l1-simple-tracker"] });

    expect(edited.experiments.map((e) => e.id)).toEqual([kept.id, "l1-simple-tracker"]);
    expect(edited.experiments[0].reason).toBe(kept.reason);
    expect(edited.experiments[1].reason).toBe("Chosen by a reviewer");
    expect(edited.experiments[1].steps.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects unknown, duplicate, or too many experiments", async () => {
    const report = await currentReport();

    expect(() => applyEdits(rubric, report, { experimentIds: ["not-an-experiment"] })).toThrow(
      /Unknown experiment/,
    );
    expect(() =>
      applyEdits(rubric, report, { experimentIds: ["l1-simple-tracker", "l1-simple-tracker"] }),
    ).toThrow(/distinct/);
    expect(() =>
      applyEdits(rubric, report, {
        experimentIds: [
          "l1-simple-tracker",
          "l2-rebalance-the-week",
          "l3-two-week-experiment",
          "p2-tier-your-effort",
        ],
      }),
    ).toThrow(/At most 3/);
  });

  it("allows removing all experiments", async () => {
    const report = await currentReport();

    expect(applyEdits(rubric, report, { experimentIds: [] }).experiments).toEqual([]);
  });
});

describe("recheckViolations", () => {
  it("flags rule breaks introduced by an edit, and nothing for clean text", async () => {
    const { f, reportId } = await withDraft();
    const stored = (await f.reportRepo.getById(reportId))!;

    expect(recheckViolations(stored.report!, stored.pack)).toEqual({
      narrativeViolations: [],
      textViolations: [],
    });

    const edited = applyEdits(rubric, stored.report!, {
      bottomLine: "He should apply to 99 roles.",
    });
    const { narrativeViolations } = recheckViolations(edited, stored.pack);
    expect(narrativeViolations.join("\n")).toMatch(/bottomLine uses a gendered pronoun/);
    expect(narrativeViolations.join("\n")).toMatch(/contains the number 99/);
    expect(narrativeOf(edited).bottomLine).toBe("He should apply to 99 roles.");
  });

  it("returns no narrative violations when there is no pack to check against", async () => {
    const { f, reportId } = await withDraft();
    const stored = (await f.reportRepo.getById(reportId))!;

    expect(recheckViolations(stored.report!, null).narrativeViolations).toEqual([]);
  });
});

describe("saveEdits", () => {
  it("saves a draft's edits and keeps the original as generated", async () => {
    const { f, reportId } = await withDraft();
    const before = (await f.reportRepo.getById(reportId))!;

    const saved = await saveEdits(f.reviewDeps, reportId, { bottomLine: "My own takeaway." });

    expect(saved.report?.bottomLine).toBe("My own takeaway.");
    expect(saved.generatedReport?.bottomLine).toBe(before.generatedReport?.bottomLine);
  });

  it("updates the visible violations: introduces them, and clears them when fixed", async () => {
    const { f, reportId } = await withDraft();

    const broken = await saveEdits(f.reviewDeps, reportId, {
      whatWeHeard: "She is looking for roles.",
    });
    expect(broken.narrativeViolations.join("\n")).toMatch(/whatWeHeard uses a gendered pronoun/);

    const fixed = await saveEdits(f.reviewDeps, reportId, {
      whatWeHeard: "You are looking for roles.",
    });
    expect(fixed.narrativeViolations).toEqual([]);
  });

  it("refuses to edit a report that is not a draft", async () => {
    const { f, reportId } = await withDraft();
    await release(f, reportId);

    await expect(saveEdits(f.reviewDeps, reportId, { bottomLine: "x" })).rejects.toThrow(
      InvalidReportStateError,
    );
  });

  it("throws for a report that does not exist", async () => {
    const f = await setup();

    await expect(saveEdits(f.reviewDeps, "missing", { bottomLine: "x" })).rejects.toThrow(
      ReportNotFoundError,
    );
  });
});

describe("regenerateNarrative", () => {
  it("rewrites the text from the stored extraction, discarding edits, without extracting again", async () => {
    const { f, reportId } = await withDraft();
    await saveEdits(f.reviewDeps, reportId, { bottomLine: "My own takeaway." });
    const extractionBefore = f.model.calls.extraction;
    const narrativeBefore = f.model.calls.narrative;

    const regenerated = await regenerateNarrative(f.reviewDeps, reportId);

    expect(regenerated.report?.bottomLine).toMatch(/build on what already works/);
    expect(regenerated.generatedReport).toEqual(regenerated.report);
    expect(f.model.calls.extraction).toBe(extractionBefore);
    expect(f.model.calls.narrative).toBe(narrativeBefore + 1);
  });

  it("refuses when the report is not a draft", async () => {
    const { f, reportId } = await withDraft();
    await release(f, reportId);

    await expect(regenerateNarrative(f.reviewDeps, reportId)).rejects.toThrow(
      InvalidReportStateError,
    );
  });
});

describe("reports from an older rubric", () => {
  it("refuses to rewrite the text from evidence extracted under a different rubric", async () => {
    const { f, reportId } = await withDraft();
    await f.reportRepo.update(reportId, { rubricVersion: "0.4.0" });

    await expect(regenerateNarrative(f.reviewDeps, reportId)).rejects.toThrow(
      /extracted under rubric 0\.4\.0.*Re-run it from scratch/,
    );
  });

  it("can still be re-run from scratch", async () => {
    const { f, reportId } = await withDraft();
    await f.reportRepo.update(reportId, { rubricVersion: "0.4.0" });

    expect((await requeueFromScratch(f.reviewDeps, reportId)).status).toBe("pending");
  });
});

describe("requeueFromScratch", () => {
  it("clears the work and queues the report again", async () => {
    const { f, reportId } = await withDraft();

    const requeued = await requeueFromScratch(f.reviewDeps, reportId);

    expect(requeued).toMatchObject({
      status: "pending",
      extractionRuns: [],
      aggregate: null,
      report: null,
      generatedReport: null,
      error: null,
    });
    const result = await runSweep(f.deps);
    expect(result.processed).toEqual({ reportId, outcome: "draft" });
  });

  it("works for a failed report", async () => {
    const f = await setup({ model: { failNarrative: true } });
    await f.addInterview(8);
    const swept = await runSweep(f.deps);

    const requeued = await requeueFromScratch(f.reviewDeps, swept.processed!.reportId);

    expect(requeued.status).toBe("pending");
  });

  it("refuses for a released report", async () => {
    const { f, reportId } = await withDraft();
    await release(f, reportId);

    await expect(requeueFromScratch(f.reviewDeps, reportId)).rejects.toThrow(
      InvalidReportStateError,
    );
  });
});

describe("releaseReport", () => {
  it("releases a draft with a private link and emails it to the participant", async () => {
    const { f, reportId } = await withDraft();

    const result = await release(f, reportId);

    expect(result.emailSent).toBe(true);
    expect(result.report).toMatchObject({ status: "released", releasedBy: "pm@example.com" });
    expect(result.report.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.report.emailSentAt).toBeInstanceOf(Date);
    expect((await f.reportRepo.getByAccessToken(result.report.accessToken!))?.id).toBe(reportId);

    expect(f.emailClient.sent).toHaveLength(1);
    expect(f.emailClient.sent[0].to).toBe("jordan@example.com");
    expect(f.emailClient.sent[0].subject).toBe("Your job search report is ready, Jordan");
    expect(f.emailClient.sent[0].html).toContain("attached");
    expect(f.emailClient.sent[0].html).toContain("The attached report has the detail");
    expect(f.emailClient.sent[0].html).not.toContain("/report/");

    // The short version is in the email itself.
    expect(f.emailClient.sent[0].html).toContain("Working well");
    expect(f.emailClient.sent[0].html).toContain("Focus: ");

    // The attachment is a PDF made from the same HTML the reviewer previews.
    const [attachment] = f.emailClient.sent[0].attachments!;
    expect(attachment.filename).toBe("Your-Job-Search-Report.pdf");
    const attached = Buffer.from(attachment.content, "base64").toString("utf-8");
    expect(attached).toMatch(/^%PDF-/);
    expect(f.pdfInputs).toHaveLength(1);
    expect(f.pdfInputs[0]).toMatch(/^<!doctype html>/);
    expect(f.pdfInputs[0]).toContain("The short version");
    expect(f.pdfInputs[0]).toContain("Prepared for Jordan");
    expect(f.pdfInputs[0]).toContain("https://discoverfirst.co/jobseekers");
  });

  it("stays released and says so when the PDF cannot be made", async () => {
    const { f, reportId } = await withDraft();
    f.reviewDeps.renderPdf = async () => {
      throw new Error("Chromium would not start");
    };

    const result = await release(f, reportId);

    expect(result.report.status).toBe("released");
    expect(result.emailSent).toBe(false);
    expect(result.emailError).toBe("Could not create the PDF: Chromium would not start");
    expect(f.emailClient.sent).toHaveLength(0);
    expect(result.report.emailSentAt).toBeNull();
  });

  it("blocks release while rule violations remain, unless they are acknowledged", async () => {
    const { f, reportId } = await withDraft({
      model: { executiveSummary: "He has a clear target." },
    });

    await expect(release(f, reportId)).rejects.toThrow(ReleaseBlockedError);
    expect(f.emailClient.sent).toHaveLength(0);

    const result = await release(f, reportId, { acknowledgeViolations: true });
    expect(result.report.status).toBe("released");
  });

  it("stays released when the email fails, and says so", async () => {
    const { f, reportId } = await withDraft();
    f.emailClient.scriptFailure(new Error("mail server down"));

    const result = await release(f, reportId);

    expect(result.emailSent).toBe(false);
    expect(result.emailError).toBe("mail server down");
    expect(result.report.status).toBe("released");
    expect(result.report.emailSentAt).toBeNull();
    expect(result.report.accessToken).toBeTruthy();
  });

  it("refuses a report that is not ready", async () => {
    const f = await setup();
    const interviewId = await f.addInterview(8);
    const { report } = await f.reportRepo.enqueue({ interviewId, studyId: f.studyId });

    await expect(release(f, report.id)).rejects.toThrow(InvalidReportStateError);
  });

  it("can release a withdrawn report again, with a new link", async () => {
    const { f, reportId } = await withDraft();
    const first = await release(f, reportId);
    await withdrawReport(f.reviewDeps, reportId);

    const second = await release(f, reportId);

    expect(second.report.status).toBe("released");
    expect(second.report.accessToken).not.toBe(first.report.accessToken);
    expect(second.report.withdrawnAt).toBeNull();
  });
});

describe("resendReportEmail", () => {
  it("sends the report attachment again for a released report", async () => {
    const { f, reportId } = await withDraft();
    await release(f, reportId);

    const result = await resendReportEmail(f.reviewDeps, reportId);

    expect(result.emailSent).toBe(true);
    expect(f.emailClient.sent).toHaveLength(2);
    expect(f.emailClient.sent[1].attachments).toEqual(f.emailClient.sent[0].attachments);
  });

  it("reports a failed resend, and refuses unless the report is released", async () => {
    const { f, reportId } = await withDraft();
    await expect(resendReportEmail(f.reviewDeps, reportId)).rejects.toThrow(
      InvalidReportStateError,
    );

    await release(f, reportId);
    f.emailClient.scriptFailure(new Error("still down"));
    const result = await resendReportEmail(f.reviewDeps, reportId);

    expect(result).toMatchObject({ emailSent: false, emailError: "still down" });
  });
});

describe("withdrawReport", () => {
  it("takes a released report offline: the link no longer finds it", async () => {
    const { f, reportId } = await withDraft();
    const { report } = await release(f, reportId);

    const withdrawn = await withdrawReport(f.reviewDeps, reportId);

    expect(withdrawn).toMatchObject({ status: "withdrawn", accessToken: null });
    expect(withdrawn.withdrawnAt).toBeInstanceOf(Date);
    expect(await f.reportRepo.getByAccessToken(report.accessToken!)).toBeNull();
  });

  it("refuses unless the report is released", async () => {
    const { f, reportId } = await withDraft();

    await expect(withdrawReport(f.reviewDeps, reportId)).rejects.toThrow(InvalidReportStateError);
  });
});

describe("report email", () => {
  const tldr = {
    workingWell: ["Focus: Knows what you are good at"],
    notWorkingAsWell: ["Pitch: Makes the case for you <script>"],
    experiments: ["Lead with two reasons to interview you"],
  };

  it("names the attached PDF, carries the short version, and escapes everything", () => {
    const email = renderReportEmail({ firstName: "<b>Sam</b>", tldr });

    expect(email.html).toContain("&lt;b&gt;Sam&lt;/b&gt;");
    expect(email.html).toContain("Your-Job-Search-Report.pdf");
    expect(email.html).toContain("Focus: Knows what you are good at");
    expect(email.html).toContain("Pitch: Makes the case for you &lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<a ");
  });

  it("leaves out a part of the short version that has nothing in it", () => {
    const email = renderReportEmail({
      firstName: "Sam",
      tldr: { ...tldr, notWorkingAsWell: [] },
    });

    expect(email.html).toContain("Working well");
    expect(email.html).not.toContain("Not working as well");
  });

  it("builds the report URL without doubled slashes and encodes the token", () => {
    expect(reportUrl("https://x.example/", "a/b c")).toBe("https://x.example/report/a%2Fb%20c");
  });
});
