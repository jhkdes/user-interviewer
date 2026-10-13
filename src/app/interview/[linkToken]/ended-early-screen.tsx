/**
 * Shown when a voice call ended before there was a full conversation: a lost
 * connection, a long silence, or the participant leaving early. The wording is
 * the same for every study. Starting again begins a new interview with the
 * name, email and answers the participant already gave.
 */
export function EndedEarlyScreen({
  onStartAgain,
  starting = false,
  error = null,
}: {
  onStartAgain: () => void;
  starting?: boolean;
  error?: string | null;
}) {
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">Your call ended early</h1>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        Something interrupted the call, or it ended before we had a full conversation, so what we
        have is too short to follow up on. If you&apos;d like to try again, you can start over. It
        begins a new interview from the beginning.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onStartAgain}
        disabled={starting}
        className="mt-6 rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {starting ? "Starting…" : "Start again"}
      </button>
    </div>
  );
}
