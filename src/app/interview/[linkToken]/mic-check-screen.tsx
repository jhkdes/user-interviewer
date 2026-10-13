"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { READINGS_TO_HEAR, rmsLevel, SILENCE_TIMEOUT_MS, SPEECH_LEVEL } from "./mic-level";

type Phase = "asking" | "listening" | "heard" | "silent" | "denied" | "no-microphone" | "failed";

/**
 * Shown before a voice call: asks for the microphone and waits for the
 * participant to say a few words, so a muted, wrong or blocked microphone is
 * found before the interview starts instead of during it. A browser with no
 * microphone access to test (and a test environment) skips straight on.
 */
export function MicCheckScreen({ onContinue }: { onContinue: () => void }) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [level, setLevel] = useState(0);
  const [deviceLabel, setDeviceLabel] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const releaseRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onContinue();
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let stream: MediaStream | undefined;
    let audioContext: AudioContext | undefined;

    const release = () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      stream?.getTracks().forEach((track) => track.stop());
      void audioContext?.close().catch(() => {});
      intervalId = timeoutId = stream = audioContext = undefined;
    };
    releaseRef.current = release;

    setPhase("asking");
    setLevel(0);
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((granted) => {
        if (cancelled) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = granted;
        setDeviceLabel(granted.getAudioTracks()[0]?.label || null);
        setPhase("listening");

        audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        audioContext.createMediaStreamSource(granted).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        let loudReadings = 0;

        intervalId = setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          const current = rmsLevel(samples);
          setLevel(current);
          if (current >= SPEECH_LEVEL) loudReadings++;
          if (loudReadings >= READINGS_TO_HEAR) setPhase("heard");
        }, 100);
        // Keep listening after this, so speaking late still turns the check green.
        timeoutId = setTimeout(() => {
          setPhase((current) => (current === "listening" ? "silent" : current));
        }, SILENCE_TIMEOUT_MS);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const name = error instanceof Error ? error.name : "";
        setPhase(
          name === "NotAllowedError" || name === "SecurityError"
            ? "denied"
            : name === "NotFoundError" || name === "OverconstrainedError"
              ? "no-microphone"
              : "failed",
        );
      });

    return () => {
      cancelled = true;
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when "Try again" bumps the attempt
  }, [attempt]);

  const proceed = useCallback(() => {
    // Let go of the microphone first so the call can take it.
    releaseRef.current();
    onContinue();
  }, [onContinue]);

  const problem = phase === "denied" || phase === "no-microphone" || phase === "failed";
  const meterPercent = Math.min(100, Math.round(level * 400));

  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">Check your microphone</h1>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        This is a voice conversation, so the interviewer needs to hear you. Say a few words, like
        &ldquo;testing, one two three&rdquo;.
      </p>

      {phase === "asking" && (
        <p role="status" className="mt-6 text-sm">
          Your browser may ask for permission to use your microphone. Choose Allow.
        </p>
      )}

      {(phase === "listening" || phase === "heard" || phase === "silent") && (
        <div className="mt-6">
          <div
            role="meter"
            aria-label="Microphone level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={meterPercent}
            className="mx-auto h-3 w-full max-w-xs overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800"
          >
            <div
              className={`h-full transition-[width] duration-100 ${
                phase === "heard" ? "bg-green-600" : "bg-neutral-500"
              }`}
              style={{ width: `${meterPercent}%` }}
            />
          </div>
          {deviceLabel && (
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Using: {deviceLabel}
            </p>
          )}
        </div>
      )}

      {phase === "listening" && (
        <p role="status" className="mt-4 text-sm">
          Listening…
        </p>
      )}
      {phase === "heard" && (
        <p role="status" className="mt-4 text-sm text-green-700 dark:text-green-400">
          We can hear you. You&apos;re ready.
        </p>
      )}
      {phase === "silent" && (
        <div role="alert" className="mt-4 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium">We can&apos;t hear you yet.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-left">
            <li>Check that your microphone isn&apos;t muted, on the device or in your settings.</li>
            <li>
              If you use a headset or an external microphone, make sure it is plugged in and chosen
              in your browser or system sound settings.
            </li>
            <li>Move closer to the microphone and speak at a normal volume.</li>
          </ul>
        </div>
      )}
      {phase === "denied" && (
        <p role="alert" className="mt-6 text-sm text-red-600 dark:text-red-400">
          Your browser is blocking the microphone. Click the lock icon next to the web address,
          allow the microphone for this site, then choose Try again.
        </p>
      )}
      {phase === "no-microphone" && (
        <p role="alert" className="mt-6 text-sm text-red-600 dark:text-red-400">
          We couldn&apos;t find a microphone. Plug one in or turn it on, then choose Try again.
        </p>
      )}
      {phase === "failed" && (
        <p role="alert" className="mt-6 text-sm text-red-600 dark:text-red-400">
          We couldn&apos;t use your microphone. Close other apps that might be using it, then choose
          Try again.
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        {phase === "heard" && (
          <button
            type="button"
            onClick={proceed}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Start the conversation
          </button>
        )}
        {(phase === "silent" || problem) && (
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Try again
          </button>
        )}
        {phase === "silent" && (
          <button
            type="button"
            onClick={proceed}
            className="text-sm text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400"
          >
            Start anyway
          </button>
        )}
      </div>
    </div>
  );
}
