export type CallStatus = "connecting" | "starting" | "in-progress" | "ended" | "error";

const STATUS_COPY: Record<CallStatus, string> = {
  connecting: "Connecting…",
  starting: "AI interviewer, Riley, is getting ready…",
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

export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
}: {
  status: CallStatus;
  errorMessage: string | null;
  elapsedSeconds: number;
}) {
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">{STATUS_COPY[status]}</h1>
      {(status === "connecting" || status === "starting") && <GettingReadyAnimation />}
      {status === "in-progress" && (
        <>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
            {formatElapsed(elapsedSeconds)} elapsed
          </p>
          <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
            Ready to wrap up? Just let Riley know, and it&apos;ll bring the interview to a close.
          </p>
        </>
      )}
      {errorMessage && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
    </div>
  );
}
