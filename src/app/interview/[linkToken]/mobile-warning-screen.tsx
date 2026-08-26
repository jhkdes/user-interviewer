/**
 * Shown when the participant opened the link on a mobile device. Mobile
 * browsers suspend a backgrounded/locked-screen tab, which drops the Vapi
 * call mid-interview — this warns them up front and asks for an explicit
 * opt-in to continue anyway, stating the caveat plainly rather than letting
 * them find out mid-call.
 */
export function MobileWarningScreen({ onContinueAnyway }: { onContinueAnyway: () => void }) {
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">You&apos;re on a mobile device</h1>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        This interview is a 15&ndash;20 minute voice call. On mobile, if your screen locks or you
        switch to another app, the call will end and can&apos;t be resumed. For the most reliable
        experience, we recommend opening this link on a desktop or laptop instead.
      </p>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        If you&apos;d rather continue here, keep this tab open and your screen on for the whole
        call.
      </p>
      <button
        onClick={onContinueAnyway}
        className="mt-6 rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Continue on mobile anyway
      </button>
    </div>
  );
}
