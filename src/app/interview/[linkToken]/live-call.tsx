"use client";

import { useEffect, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";

type CallStatus = "connecting" | "in-progress" | "ended" | "error";

const STATUS_COPY: Record<CallStatus, string> = {
  connecting: "Connecting…",
  "in-progress": "In progress — go ahead and talk",
  ended: "Call ended",
  error: "Something went wrong with the call",
};

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * T11.3 — starts the Vapi web call as soon as this screen mounts (consent
 * and mic permission were already established by the intro screen; Vapi's
 * `.start()` is what actually triggers the browser's mic permission
 * prompt). `metadata: { interviewId }` is read server-side via
 * `call.assistantOverrides.metadata` (webhook) / a top-level `metadata`
 * field (custom-LLM) — see M6's PROGRESS.md for why the shape has to be
 * exactly this.
 */
export function LiveCall({ interviewId, onEnded }: { interviewId: string; onEnded: () => void }) {
  const [status, setStatus] = useState<CallStatus>("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const vapiRef = useRef<Vapi | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    // React 18 StrictMode double-invokes effects in development (mount →
    // cleanup → mount again) to surface unsafe side effects. Starting a real
    // Vapi call isn't safely re-runnable — without this guard, the second
    // invocation created a second, independent call for the same interview
    // (confirmed via two separate `201`s from `POST /call/web` in a captured
    // HAR), and the two calls fighting over the same microphone is what
    // produced a "Call error" for the participant. The guard survives the
    // phantom cleanup/re-invoke because refs, unlike effect-local variables,
    // aren't reset by it.
    if (startedRef.current) return;
    startedRef.current = true;

    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
    if (!publicKey || !assistantId) {
      setStatus("error");
      setErrorMessage("The voice interviewer isn't configured yet.");
      return;
    }

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;
    let elapsedIntervalId: ReturnType<typeof setInterval> | undefined;

    vapi.on("call-start", () => {
      setStatus("in-progress");
      // T13.4 — elapsed time starts ticking once the call actually connects,
      // not at mount. The assistant has no configured `firstMessage` (see
      // custom-llm.ts) and waits for the participant to speak first, so in
      // practice this moment coincides with "the participant starts
      // speaking" without needing to parse live speech/transcript events.
      const startedAtMs = Date.now();
      setElapsedSeconds(0);
      elapsedIntervalId = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startedAtMs) / 1000));
      }, 1000);
    });
    vapi.on("call-end", () => {
      if (elapsedIntervalId) clearInterval(elapsedIntervalId);
      setStatus("ended");
      onEnded();
    });
    vapi.on("error", (error: unknown) => {
      if (elapsedIntervalId) clearInterval(elapsedIntervalId);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Call error");
    });

    vapi.start(assistantId, { metadata: { interviewId } });

    // Deliberately no `vapi.stop()` here. Calling it from this cleanup would
    // also fire on StrictMode's phantom cleanup — which runs immediately
    // after the effect above, before the call has even connected — ending
    // every dev-mode call before it could start. The call is only ever
    // stopped for real via the "End call" button or Vapi's own `call-end`
    // event (`maxDurationSeconds` / `endCallPhrases`), both of which already
    // call `onEnded()` and unmount this component as a result — so by the
    // time an unmount happens in the normal flow, the call is already over.
    return () => {
      if (elapsedIntervalId) clearInterval(elapsedIntervalId);
      vapiRef.current?.removeAllListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start the call exactly once per mount
  }, []);

  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">{STATUS_COPY[status]}</h1>
      {status === "in-progress" && (
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
          {formatElapsed(elapsedSeconds)} elapsed
        </p>
      )}
      {errorMessage && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
      )}
      {status === "in-progress" && (
        <button
          onClick={() => vapiRef.current?.stop()}
          className="mt-6 rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          End call
        </button>
      )}
    </div>
  );
}
