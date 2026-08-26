/**
 * Shown when the participant opened the link on a mobile device — a hard
 * stop, not a dismissible warning. Mobile browsers suspend a
 * backgrounded/locked-screen tab (and even a wake lock can't survive a
 * manual lock or the proximity sensor turning the screen off during a
 * call), which drops the Vapi call mid-interview. Until interviews move to
 * a real phone call (immune to all of this), mobile is blocked outright
 * rather than offered as a degraded "continue anyway" experience.
 */
export function MobileBlockedScreen() {
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">Please open this link on a desktop</h1>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        This interview is a 15&ndash;20 minute voice call. On a phone, the call is likely to get
        interrupted if your screen locks, you switch apps, or the phone senses it&apos;s near your
        ear &mdash; and once that happens, the interview ends and can&apos;t be resumed.
      </p>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        To take part, please open this same link on a desktop or laptop computer with microphone
        access instead.
      </p>
    </div>
  );
}
