import type { TranscriptEntry } from "@/domain";

/** Matches most real-world email addresses closely enough for redaction purposes — false negatives here just leave text for the PM's own review to catch, never a crash. */
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Escapes regex metacharacters in a name before interpolating it into a pattern — a participant's first name is arbitrary user input, not a literal we control. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Deterministic first pass for the printable interview export — replaces
 * the participant's own first name and any email-looking text in the
 * transcript with generic placeholders. Not a general PII scrubber:
 * anything else the participant said in their own words (company names,
 * other people mentioned, phone numbers, etc.) is left untouched here and
 * is the PM's job to catch in the review step that follows (see
 * redacted-transcript-editor.tsx) before the export is ever printed or
 * shared.
 *
 * Pure and synchronous — never mutates `transcript`, only `text` differs
 * per returned entry (same `speaker`/`timestampMs`).
 */
export function autoRedactTranscript(
  transcript: TranscriptEntry[],
  firstName: string,
): TranscriptEntry[] {
  const namePattern = firstName.trim()
    ? new RegExp(`\\b${escapeRegExp(firstName.trim())}\\b`, "gi")
    : null;

  return transcript.map((entry) => {
    // Email first: an email's local part can itself contain the
    // participant's name as a substring (e.g. "jae.kim@..."), so redacting
    // the name first can fragment the email and leave a garbled partial
    // match behind instead of one clean "[redacted email]".
    let text = entry.text.replace(EMAIL_PATTERN, "[redacted email]");
    if (namePattern) text = text.replace(namePattern, "[Participant]");
    return { ...entry, text };
  });
}
