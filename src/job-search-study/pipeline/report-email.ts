/** The email that delivers a participant's report, which travels as an attached PDF. Pure: no I/O. */

import type { Tldr } from "../report/tldr";

export interface ReportEmail {
  subject: string;
  html: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const REPORT_ATTACHMENT_FILENAME = "Your-Job-Search-Report.pdf";

function list(heading: string, items: string[], tag: "ul" | "ol" = "ul"): string {
  if (items.length === 0) return "";
  return `<p><strong>${heading}</strong></p><${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
}

const formatDate = (date: Date) =>
  date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * The email body carries the short version, so the key points show without
 * opening the attached PDF. `replaces` is the date of an earlier report email
 * this one supersedes (after a wipe), and changes the subject and opening.
 */
export function renderReportEmail(input: {
  firstName: string;
  tldr: Tldr;
  replaces?: Date | null;
}): ReportEmail {
  const name = escapeHtml(input.firstName);
  const replacement = input.replaces
    ? `<p><strong>This report replaces the one we sent you on ${escapeHtml(formatDate(input.replaces))}.</strong> Please use this version and set the earlier one aside.</p>`
    : "";
  const html = `
    <p>Hi ${name},</p>
    ${replacement}
    <p>Thank you for talking with us about your job search. Your personalized report is attached to this email as a PDF (${REPORT_ATTACHMENT_FILENAME}). Here is the short version:</p>
    ${list("Working well", input.tldr.workingWell)}
    ${list("Not working as well", input.tldr.notWorkingAsWell)}
    ${list("Experiments to try", input.tldr.experiments, "ol")}
    <p>The attached report has the detail behind each of these. It describes your job search, so please keep it to yourself.</p>
    <p>If you try an experiment and want to tell us how it went, just reply to this email.</p>
  `.trim();
  const subject = input.replaces
    ? `Your updated job search report is ready, ${input.firstName}`
    : `Your job search report is ready, ${input.firstName}`;
  return { subject, html };
}
