/** Matches most real-world email addresses closely enough for redaction. */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces the given participants' first names and any email-looking text in
 * a single string. Anything else a participant said (companies, other
 * people, phone numbers) is left as spoken — see VIEWER_ACCESS.md.
 *
 * The interviewer greets participants by first name (it is a prompt input),
 * so a transcript without this pass would name the participant in nearly
 * every interview.
 *
 * A name matches as a whole word, judged with Unicode letters and digits
 * rather than `\b`, which would miss names with accents ("José") or ending
 * in punctuation ("J.R.") and leave them visible. Matching ignores case.
 */
export function redactIdentity(text: string, firstNames: readonly string[]): string {
  // Emails first: an email's local part can contain the name ("jae.kim@..."),
  // and redacting the name first would leave a garbled fragment of the email.
  let result = text.replace(EMAIL_PATTERN, "[redacted email]");

  // Longest first, so "Anna-Marie" is redacted as one name before "Anna" can
  // fragment it.
  const names = [...new Set(firstNames.map((n) => n.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  for (const name of names) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, "giu");
    result = result.replace(pattern, "[Participant]");
  }
  return result;
}
