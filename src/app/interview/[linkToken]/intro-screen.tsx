/**
 * T11.1 — study purpose, recording disclosure, and the explicit consent
 * gate. Per REQUIREMENTS.md's flow, this is the "I agree, start interview"
 * click that establishes consent — the intake form (T11.2) that follows
 * only ever gets reached after this, so its submission always sends
 * `consentGiven: true`.
 */
export function IntroScreen({ onAgree }: { onAgree: () => void }) {
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold">You&apos;re invited to a research interview</h1>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        We&apos;re talking with people like you to understand your day-to-day work and where things
        get frustrating. This is a short voice conversation with an AI interviewer — not a survey —
        and usually takes 10&ndash;15 minutes.
      </p>
      <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
        The call will be recorded (audio and transcript) so we can review it afterward. We&apos;ll
        ask for your name and email so we can follow up and share what we learn &mdash; you&apos;re
        a research partner here, not just a data point.
      </p>
      <button
        onClick={onAgree}
        className="mt-6 rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        I agree, start interview
      </button>
    </div>
  );
}
