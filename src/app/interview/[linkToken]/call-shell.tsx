import type { StudyType } from "@/domain";
import { FEEDBACK_TARGET_MINUTES, INTERVIEW_LENGTH_MINUTES } from "@/interview-agent/termination";
import { formatDuration } from "@/lib/format-duration";
import { SWITCH_TO_TEXT_WINDOW_MS } from "@/text-session/constants";
import { RestartWithTyping } from "./restart-with-typing";

export type CallStatus = "connecting" | "starting" | "in-progress" | "ended" | "error";

const STATUS_COPY: Record<CallStatus, string> = {
  connecting: "Connecting…",
  starting: "AI interviewer is getting ready…",
  "in-progress": "In progress — go ahead and talk",
  ended: "Call ended",
  error: "Something went wrong with the call",
};

/** Three staggered bouncing dots — shown while the call connects and Riley's opening line is generated. */
function GettingReadyAnimation() {
  return (
    <div className="mt-4 flex justify-center gap-1.5" role="presentation">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-bounce rounded-full bg-neutral-400 dark:bg-neutral-600"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

/** Fire-and-forget — best-effort signal, never blocks or surfaces errors to the participant. */
export function reportBackgrounded(interviewId: string) {
  const url = `/api/interviews/${interviewId}/backgrounded`;
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([], { type: "application/json" }));
  } else {
    fetch(url, { method: "POST", keepalive: true }).catch(() => {});
  }
}

/** Feature-detected screen wake lock — unsupported browsers just don't get this mitigation. */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  if (!("wakeLock" in navigator)) return null;
  try {
    return await navigator.wakeLock.request("screen");
  } catch {
    // Can fail if the tab isn't visible at request time, or the OS denies it
    // — not fatal, the call continues without it.
    return null;
  }
}

/**
 * Presentational shell shared by every provider's live-call component —
 * owns none of the call lifecycle itself (see vapi-live-call.tsx /
 * elevenlabs-live-call.tsx for that), just renders whatever status they've
 * arrived at.
 */
export function CallShell({
  status,
  errorMessage,
  elapsedSeconds,
  type,
  onRestartWithTyping,
  onRetry,
}: {
  status: CallStatus;
  errorMessage: string | null;
  elapsedSeconds: number;
  type: StudyType;
  /**
   * Offers "Can't use voice? Restart with a typing interview" — passed only
   * for feedback studies with text mode on. Shown while the call connects and
   * for the first 30 seconds after the interviewer starts speaking, and
   * always on the error screen. Resolves true once the interview was
   * restarted as a typing interview.
   */
  onRestartWithTyping?: () => Promise<boolean>;
  /** Offers "Try again" on the error screen, for an error before the call properly began. */
  onRetry?: () => void;
}) {
  const withinRestartWindow =
    status === "connecting" ||
    status === "starting" ||
    (status === "in-progress" && elapsedSeconds * 1000 < SWITCH_TO_TEXT_WINDOW_MS);
  const showRestart = onRestartWithTyping && (status === "error" || withinRestartWindow);

  const targetMinutes = type === "feedback" ? FEEDBACK_TARGET_MINUTES : INTERVIEW_LENGTH_MINUTES;

  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">{STATUS_COPY[status]}</h1>
      {(status === "connecting" || status === "starting") && <GettingReadyAnimation />}
      {status === "in-progress" && (
        <>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
            {formatDuration(elapsedSeconds)} elapsed
          </p>
          <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
            {type === "feedback" ? "This" : "Interview"} takes about {targetMinutes} mins. If you
            need to wrap up early, just let the AI interviewer know.
          </p>
        </>
      )}
      {errorMessage && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
      {status === "error" && onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Try again
        </button>
      )}
      {showRestart && (
        <RestartWithTyping
          // Nothing has been said on the error screen, so there is nothing to confirm discarding.
          needsConfirmation={status !== "error"}
          onRestart={onRestartWithTyping}
        />
      )}
    </div>
  );
}
