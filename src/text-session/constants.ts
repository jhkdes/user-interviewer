/** Longest participant message accepted, in Unicode characters. Enforced here (server) and in the chat input (client). */
export const MAX_MESSAGE_CHARS = 2000;

/** Longest client-generated message id accepted. */
export const MAX_CLIENT_MESSAGE_ID_CHARS = 100;

/** Largest request body the text-turn route reads. 2,000 characters can be up to 8 KB of UTF-8 before JSON escaping, so this leaves generous headroom. */
export const MAX_REQUEST_BODY_BYTES = 32 * 1024;

/** Per-interview rate limit: minimum gap between two participant messages. */
export const MIN_MS_BETWEEN_PARTICIPANT_MESSAGES = 2_000;

/** Per-interview rate limit: most participant messages in any rolling minute. */
export const MAX_PARTICIPANT_MESSAGES_PER_MINUTE = 10;

/** Most participant messages one interview may contain. A normal feedback interview is far below this; hitting it completes the interview with `endedReason: "message-limit"`. */
export const MAX_PARTICIPANT_MESSAGES = 50;

/**
 * How long a saved participant message may sit without an interviewer reply
 * before it is treated as a failed turn (the model call errored or the
 * server died mid-stream) rather than one still being generated. After this,
 * a request with the same `clientMessageId`, or an empty "advance" request,
 * regenerates the missing reply instead of getting `still-replying`.
 */
export const STALE_REPLY_MS = 60_000;

/** The scripted idle nudge — inserted as an interviewer message, with no model call. Kept out of the history sent to the model (see `isIdleNudge`). */
export const IDLE_NUDGE_TEXT = "Are you still there? Take your time — reply whenever you're ready.";

/** No activity (message or typing) for this long: send the one-time nudge. */
export const IDLE_NUDGE_AFTER_MS = 3 * 60_000;

/** No activity for this long: end the interview as `participant-inactive`. */
export const IDLE_END_AFTER_MS = 7 * 60_000;

/** Backstop: an interview older than this is ended whatever its activity, so typing signals can't keep one open forever. */
export const MAX_INTERVIEW_AGE_MS = 30 * 60_000;

/** The server ignores typing signals closer together than this (measured from the last activity). */
export const TYPING_SIGNAL_MIN_INTERVAL_MS = 10_000;

/** The chat sends at most one typing signal per this interval. */
export const TYPING_SIGNAL_INTERVAL_MS = 20_000;

/** How often the open chat re-reads the interview to pick up the idle nudge and detect that it has ended. */
export const CHAT_POLL_INTERVAL_MS = 20_000;

/** One sweep ends at most this many interviews (each runs a summary and an email), leaving the rest for the next run. */
export const MAX_COMPLETIONS_PER_SWEEP = 5;

/** True for an interviewer message that is the scripted idle nudge. */
export function isIdleNudge(message: { speaker: string; text: string }): boolean {
  return message.speaker === "interviewer" && message.text === IDLE_NUDGE_TEXT;
}

/** How long into a voice call the participant may still restart as a typing interview, counted from when the interviewer starts speaking. */
export const SWITCH_TO_TEXT_WINDOW_MS = 30_000;

/**
 * Extra time the server allows beyond SWITCH_TO_TEXT_WINDOW_MS. The server
 * measures from when the call started (Vapi reports that earlier than the
 * moment the interviewer first speaks, which is what the participant's
 * 30 seconds are counted from) and has to absorb clock skew and the click
 * itself.
 */
export const SWITCH_TO_TEXT_GRACE_MS = 15_000;
