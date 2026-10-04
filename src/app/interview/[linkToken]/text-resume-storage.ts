/**
 * Remembers, in this browser only, which interview a participant was in the
 * middle of typing, so a refresh or a closed-and-reopened tab can put them
 * back in the chat instead of starting a second interview. Keyed by the
 * study link token. Every access is wrapped: storage can be unavailable or
 * throw (private windows, blocked site data), and the interview must work
 * normally — just not be resumable — when it is.
 */
function storageKey(linkToken: string): string {
  return `interview:${linkToken}`;
}

export function loadSavedInterviewId(linkToken: string): string | null {
  try {
    const raw = window.localStorage.getItem(storageKey(linkToken));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { interviewId?: unknown }).interviewId === "string"
    ) {
      return (parsed as { interviewId: string }).interviewId;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveInterviewId(linkToken: string, interviewId: string): void {
  try {
    window.localStorage.setItem(storageKey(linkToken), JSON.stringify({ interviewId }));
  } catch {
    // Not resumable, but otherwise fine.
  }
}

export function clearSavedInterviewId(linkToken: string): void {
  try {
    window.localStorage.removeItem(storageKey(linkToken));
  } catch {
    // Nothing to clear if storage isn't available.
  }
}
