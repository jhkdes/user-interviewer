import { randomBytes } from "node:crypto";
import { generateReport } from "../report/generate";
import { renderReportHtml } from "../report/render-html";
import { loadRubric } from "../rubric/rubric";
import type { JobSearchReport } from "../storage/types";
import { applyEdits, recheckViolations, type ReportEdits } from "./edits";
import { InvalidReportStateError, ReleaseBlockedError, ReportNotFoundError } from "./errors";
import { REPORT_ATTACHMENT_FILENAME, renderReportEmail } from "./report-email";
import type { ReviewDeps } from "./types";

async function load(deps: ReviewDeps, reportId: string): Promise<JobSearchReport> {
  const report = await deps.reportRepo.getById(reportId);
  if (!report) throw new ReportNotFoundError(reportId);
  return report;
}

function requireStatus(
  report: JobSearchReport,
  allowed: JobSearchReport["status"][],
  action: string,
) {
  if (!allowed.includes(report.status)) {
    throw new InvalidReportStateError(`Cannot ${action} a report that is ${report.status}.`);
  }
}

/** Saves a reviewer's edits to a draft, and re-checks the rules so what is still wrong stays visible. */
export async function saveEdits(
  deps: ReviewDeps,
  reportId: string,
  edits: ReportEdits,
): Promise<JobSearchReport> {
  const report = await load(deps, reportId);
  requireStatus(report, ["draft"], "edit");
  if (!report.report) throw new InvalidReportStateError("This report has no content to edit yet.");

  const rubric = deps.rubric ?? loadRubric();
  const edited = applyEdits(rubric, report.report, edits);
  const { narrativeViolations, textViolations } = recheckViolations(edited, report.pack);
  return deps.reportRepo.update(reportId, { report: edited, narrativeViolations, textViolations });
}

/**
 * Rewrites the participant-facing text from the stored extraction, without
 * paying for extraction again. Replaces the current report, including any
 * edits, so callers should confirm with the reviewer first.
 */
export async function regenerateNarrative(
  deps: ReviewDeps,
  reportId: string,
): Promise<JobSearchReport> {
  const report = await load(deps, reportId);
  requireStatus(report, ["draft"], "regenerate");
  if (!report.aggregate)
    throw new InvalidReportStateError("This report has no extraction to rewrite from.");

  const interview = await deps.interviewRepo.getById(report.interviewId);
  const rubric = deps.rubric ?? loadRubric();
  // The same behavior ids can mean different things under a newer rubric, so old evidence is not re-scored.
  if (report.rubricVersion && report.rubricVersion !== rubric.version) {
    throw new InvalidReportStateError(
      `This report was extracted under rubric ${report.rubricVersion}, which differs from the current ${rubric.version}. Re-run it from scratch.`,
    );
  }
  const generated = await generateReport(
    { complete: deps.complete },
    { rubric, aggregate: report.aggregate, screenerAnswers: interview?.screenerAnswers ?? null },
  );
  return deps.reportRepo.update(reportId, {
    scoring: generated.scoring,
    pack: generated.pack,
    comparison: generated.comparison,
    generatedReport: generated.report,
    report: generated.report,
    narrativeViolations: generated.narrativeViolations,
    textViolations: generated.textViolations,
  });
}

/** Throws the work away and queues the report to be extracted from scratch. Allowed for a draft, a failed report, or a skipped one. */
export async function requeueFromScratch(
  deps: ReviewDeps,
  reportId: string,
): Promise<JobSearchReport> {
  const report = await load(deps, reportId);
  requireStatus(report, ["draft", "failed", "skipped"], "re-run");
  return deps.reportRepo.update(reportId, {
    status: "pending",
    rubricVersion: null,
    extractionRuns: [],
    aggregate: null,
    scoring: null,
    pack: null,
    comparison: null,
    generatedReport: null,
    report: null,
    narrativeViolations: [],
    textViolations: [],
    error: null,
  });
}

export interface ReleaseOptions {
  /** Who is releasing it (shown in the review history). */
  releasedBy: string;
  /** Required to release a report that still has rule violations. */
  acknowledgeViolations?: boolean;
}

export interface ReleaseResult {
  report: JobSearchReport;
  emailSent: boolean;
  emailError: string | null;
}

/** Emails the participant their report as an attached, self-contained HTML file. */
async function sendReportEmail(
  deps: ReviewDeps,
  report: JobSearchReport,
): Promise<{ sent: boolean; error: string | null }> {
  const interview = await deps.interviewRepo.getById(report.interviewId);
  if (!interview) return { sent: false, error: "The interview no longer exists." };
  if (!report.report) return { sent: false, error: "The report has no content." };

  const { subject, html } = renderReportEmail({ firstName: interview.firstName });
  const attachment = {
    filename: REPORT_ATTACHMENT_FILENAME,
    content: Buffer.from(renderReportHtml(report.report), "utf-8").toString("base64"),
  };
  try {
    await deps.emailClient.send({ to: interview.email, subject, html, attachments: [attachment] });
    return { sent: true, error: null };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Releases a reviewed draft: emails the participant the report as an attached
 * file, and also makes it available at a private link. A failed email does not undo the release; the result says so and the
 * email can be resent. A withdrawn report can be released again with a new link.
 */
export async function releaseReport(
  deps: ReviewDeps,
  reportId: string,
  options: ReleaseOptions,
): Promise<ReleaseResult> {
  const report = await load(deps, reportId);
  requireStatus(report, ["draft", "withdrawn"], "release");
  if (!report.report) throw new InvalidReportStateError("This report has no content to release.");

  const violations = [...report.narrativeViolations, ...report.textViolations];
  if (violations.length > 0 && !options.acknowledgeViolations)
    throw new ReleaseBlockedError(violations);

  const now = (deps.now ?? (() => new Date()))();
  const released = await deps.reportRepo.update(reportId, {
    status: "released",
    accessToken: randomBytes(32).toString("base64url"),
    releasedAt: now,
    releasedBy: options.releasedBy,
    emailSentAt: null,
    withdrawnAt: null,
  });

  const email = await sendReportEmail(deps, released);
  const final = email.sent
    ? await deps.reportRepo.update(reportId, { emailSentAt: now })
    : released;
  return { report: final, emailSent: email.sent, emailError: email.error };
}

/** Sends the report email again for a released report. */
export async function resendReportEmail(
  deps: ReviewDeps,
  reportId: string,
): Promise<ReleaseResult> {
  const report = await load(deps, reportId);
  requireStatus(report, ["released"], "email");

  const email = await sendReportEmail(deps, report);
  const now = (deps.now ?? (() => new Date()))();
  const final = email.sent ? await deps.reportRepo.update(reportId, { emailSentAt: now }) : report;
  return { report: final, emailSent: email.sent, emailError: email.error };
}

/** Takes a released report offline: the link stops working immediately. */
export async function withdrawReport(deps: ReviewDeps, reportId: string): Promise<JobSearchReport> {
  const report = await load(deps, reportId);
  requireStatus(report, ["released"], "withdraw");
  const now = (deps.now ?? (() => new Date()))();
  return deps.reportRepo.update(reportId, {
    status: "withdrawn",
    accessToken: null,
    withdrawnAt: now,
  });
}
