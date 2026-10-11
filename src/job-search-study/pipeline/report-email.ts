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

export function reportUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/report/${encodeURIComponent(token)}`;
}

export const REPORT_ATTACHMENT_FILENAME = "Your-Job-Search-Report.pdf";

function list(heading: string, items: string[], tag: "ul" | "ol" = "ul"): string {
  if (items.length === 0) return "";
  return `<p><strong>${heading}</strong></p><${tag}>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</${tag}>`;
}

/** The email body carries the short version, so the key points show without opening the attached PDF. */
export function renderReportEmail(input: { firstName: string; tldr: Tldr }): ReportEmail {
  const name = escapeHtml(input.firstName);
  const html = `
    <p>Hi ${name},</p>
    <p>Thank you for talking with us about your job search. Your personalized report is attached to this email as a PDF (${REPORT_ATTACHMENT_FILENAME}). Here is the short version:</p>
    ${list("Working well", input.tldr.workingWell)}
    ${list("Not working as well", input.tldr.notWorkingAsWell)}
    ${list("Experiments to try", input.tldr.experiments, "ol")}
    <p>The attached report has the detail behind each of these. It describes your job search, so please keep it to yourself.</p>
    <p>If you try an experiment and want to tell us how it went, just reply to this email.</p>
  `.trim();
  return { subject: `Your job search report is ready, ${input.firstName}`, html };
}
