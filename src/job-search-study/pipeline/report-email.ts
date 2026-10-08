/** The email that tells a participant their report is ready. Pure: no I/O. */

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

export function renderReportEmail(input: { firstName: string; url: string }): ReportEmail {
  const name = escapeHtml(input.firstName);
  const url = escapeHtml(input.url);
  const html = `
    <p>Hi ${name},</p>
    <p>Thank you for talking with us about your job search. Your personalized report is ready. It shows where your search stands, what is going well, and a few small experiments to try.</p>
    <p><a href="${url}">Open your report</a></p>
    <p>The link is private to you, so please don't forward it. Anyone who has it can read your report.</p>
    <p>If you try an experiment and want to tell us how it went, just reply to this email.</p>
  `.trim();
  return { subject: `Your job search report is ready, ${input.firstName}`, html };
}
