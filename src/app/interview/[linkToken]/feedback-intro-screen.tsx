/**
 * Simplified intro screen for feedback-type studies (FEEDBACK_STUDY_TYPE.md
 * decision 7) — a quick post-webinar/post-session check-in, not a 15-minute
 * research interview, so this deliberately skips the 4-step "how it works"
 * walkthrough, the facts row, and the FAQ link that `IntroScreen` shows: none
 * of that framing fits a 5-minute call. The primary button click is still the
 * consent action, same as `IntroScreen`.
 *
 * With `textModeEnabled`, the copy also covers the typing alternative (see
 * TEXT_INTERVIEW_MODE.md): voice is still how it starts, but the recording
 * disclosure says what is saved in each case. Without it, the copy is exactly
 * what voice-only studies have always shown.
 */
export function FeedbackIntroScreen({
  title,
  description,
  onAgree,
  textModeEnabled = false,
}: {
  title: string;
  description: string;
  onAgree: () => void;
  textModeEnabled?: boolean;
}) {
  const facts = textModeEnabled
    ? ["~5 minutes", "Voice, or type if you prefer", "No login"]
    : ["~5 minutes", "Voice, not text", "No login"];

  return (
    <div className="text-left">
      <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        <span className="inline-block h-px w-5 bg-neutral-400 dark:bg-neutral-600" />
        discoverFirst.co &middot; quick feedback
      </p>

      <h1 className="mt-4 text-2xl font-semibold text-balance">{title || "Feedback"}</h1>

      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
        A quick, ~5-minute voice check-in about {description || "your experience"} — a few
        questions, then you&apos;re done.
        {textModeEnabled &&
          " If talking isn't an option, you can switch to typing before you start."}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {facts.map((fact) => (
          <span
            key={fact}
            className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
          >
            {fact}
          </span>
        ))}
      </div>

      <button
        onClick={onAgree}
        className="mt-8 rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Start
      </button>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        {textModeEnabled
          ? "If you talk, the call is recorded (audio and transcript) so we can review it afterward. If you choose to type instead, the conversation is saved as a transcript. Starting means you're okay with that."
          : "The call is recorded (audio and transcript) so we can review it afterward. Starting means you're okay with that."}
      </p>
    </div>
  );
}
