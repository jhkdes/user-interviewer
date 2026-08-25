export interface SummaryEmailContent {
  firstName: string;
  painPoints: string[];
  notableQuotes: string[];
  takeaways: string[];
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

const SUBSCRIBE_URL = "https://discoverfirst.co";

/** Minimal HTML-escaping — this content is ultimately LLM output derived from what the participant said, never trusted as markup. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderList(items: string[]): string {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

/**
 * Renders the post-interview "here's what you told us" email (#6): a
 * reflection of the participant's own interview, framed as a thank-you to a
 * research partner (matching intro-screen.tsx / completion-screen.tsx), plus
 * a subscribe CTA for discoverfirst.co. Pure function of the summary content
 * — no I/O, so it's fully unit-testable without a real email provider.
 */
export function renderSummaryEmail(content: SummaryEmailContent): RenderedEmail {
  const { firstName, painPoints, notableQuotes, takeaways } = content;
  const name = escapeHtml(firstName);

  const sections = [
    painPoints.length > 0 && `<h2>What stood out</h2>${renderList(painPoints)}`,
    notableQuotes.length > 0 &&
      `<h2>In your words</h2>${renderList(notableQuotes.map((quote) => `"${quote}"`))}`,
    takeaways.length > 0 && `<h2>Takeaways</h2>${renderList(takeaways)}`,
  ]
    .filter(Boolean)
    .join("");

  const html = `
    <p>Hi ${name},</p>
    <p>Thank you again for talking with us — you're a research partner here, not just a subject, and we wanted to reflect back what we heard from you.</p>
    ${sections}
    <p>If you're curious to see what we learn as we keep talking to people like you, you can subscribe at <a href="${SUBSCRIBE_URL}">${SUBSCRIBE_URL}</a>.</p>
    <p>Thanks again for your time.</p>
  `.trim();

  return { subject: `Here's what you told us, ${firstName}`, html };
}
