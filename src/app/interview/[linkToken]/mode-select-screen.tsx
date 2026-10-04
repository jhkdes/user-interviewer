"use client";

import { useEffect, useRef, useState } from "react";

export const MODE_SELECT_COUNTDOWN_SECONDS = 10;

/**
 * Shown after intake on feedback studies when text mode is enabled. Voice is
 * the default: the interview starts by itself when the countdown reaches
 * zero, "Start now" skips the wait, and typing is offered only as a discreet
 * link. Switching to typing stops the countdown.
 */
export function ModeSelectScreen({
  onStartVoice,
  onSwitchToTyping,
}: {
  onStartVoice: () => void;
  /** Resolves true when the interview was switched to typing (the parent then leaves this screen), false if it couldn't be. */
  onSwitchToTyping: () => Promise<boolean>;
}) {
  const [secondsLeft, setSecondsLeft] = useState(MODE_SELECT_COUNTDOWN_SECONDS);
  const [switching, setSwitching] = useState(false);
  const [switchFailed, setSwitchFailed] = useState(false);
  const started = useRef(false);

  const startVoice = () => {
    if (started.current) return;
    started.current = true;
    onStartVoice();
  };

  // The countdown runs only while nothing else is in progress. After a failed
  // switch to typing it stays stopped: the participant already showed they
  // don't want to be started automatically, so they choose what happens next.
  const counting = !switching && !switchFailed;
  useEffect(() => {
    if (!counting) return;
    if (secondsLeft <= 0) {
      startVoice();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [counting, secondsLeft]);

  const switchToTyping = async () => {
    setSwitching(true);
    setSwitchFailed(false);
    const ok = await onSwitchToTyping();
    if (!ok) {
      setSwitching(false);
      setSwitchFailed(true);
    }
  };

  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">Ready when you are</h1>
      {counting ? (
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400" aria-live="polite">
          Your voice interview starts in {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}.
          Your browser will ask to use your microphone.
        </p>
      ) : (
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400" aria-live="polite">
          {switching
            ? "Setting up your typing interview…"
            : "The countdown is paused. Start the voice interview whenever you're ready."}
        </p>
      )}

      <button
        onClick={startVoice}
        disabled={switching}
        className="mt-6 rounded bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Start now
      </button>

      {switchFailed && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          We couldn&apos;t switch to typing just now. Please try again, or start the voice
          interview.
        </p>
      )}

      <p className="mt-8">
        <button
          onClick={switchToTyping}
          disabled={switching}
          className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-700 disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          Can&apos;t talk right now? Switch to typing
        </button>
      </p>
    </div>
  );
}
