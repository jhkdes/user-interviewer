"use client";

import { useState } from "react";

/**
 * The discreet "Can't use voice? Restart with a typing interview" option on
 * the call screen. When something has already been said it asks first, since
 * restarting throws that away; on the error screen, where nothing was said,
 * it goes straight through.
 */
export function RestartWithTyping({
  needsConfirmation,
  onRestart,
}: {
  needsConfirmation: boolean;
  /** Resolves true when the interview was restarted as a typing interview (the parent then leaves this screen), false if it couldn't be. */
  onRestart: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  const restart = async () => {
    setWorking(true);
    setFailed(false);
    const ok = await onRestart();
    if (!ok) {
      setWorking(false);
      setConfirming(false);
      setFailed(true);
    }
  };

  if (working) {
    return (
      <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
        Setting up your typing interview…
      </p>
    );
  }

  if (confirming) {
    return (
      <div className="mt-6 text-sm" role="alertdialog" aria-label="Restart as a typing interview?">
        <p className="text-neutral-600 dark:text-neutral-400">
          This restarts your interview in typing mode, and what&apos;s been said so far is
          discarded.
        </p>
        <div className="mt-3 flex justify-center gap-4">
          <button
            onClick={restart}
            className="rounded bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            Restart by typing
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
          >
            Keep talking
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {failed && (
        <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-400">
          We couldn&apos;t restart as a typing interview just now. Please try again.
        </p>
      )}
      <button
        onClick={needsConfirmation ? () => setConfirming(true) : restart}
        className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
      >
        Can&apos;t use voice? Restart with a typing interview
      </button>
    </div>
  );
}
