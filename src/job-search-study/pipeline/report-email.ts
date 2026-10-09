/** The email that delivers a participant's report, which travels as an attached file. Pure: no I/O. */

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

export const REPORT_ATTACHMENT_FILENAME = "Your-Job-Search-Report.html";

export function renderReportEmail(input: { firstName: string }): ReportEmail {
  const name = escapeHtml(input.firstName);
  const html = `
    <p>Hi ${name},</p>
    <p>Thank you for talking with us about your job search. Your personalized report is attached to this email. It shows where your search stands, what is going well, and a few small experiments to try.</p>
    <p>To read it, open the attached file <strong>${REPORT_ATTACHMENT_FILENAME}</strong>. It opens in your web browser, and it also works on a phone. You can save it or print it to PDF from the browser.</p>
    <p>It describes your job search, so please keep it to yourself.</p>
    <p>If you try an experiment and want to tell us how it went, just reply to this email.</p>
  `.trim();
  return { subject: `Your job search report is ready, ${input.firstName}`, html };
}
