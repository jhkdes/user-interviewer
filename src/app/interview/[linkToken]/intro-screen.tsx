import type { ParticipantCopy } from "@/domain";
import { DISCOVERY_TEXT_HARD_CAP_MINUTES } from "@/interview-agent/termination";
import { resolveIntroCopy } from "@/participant-copy";

/**
 * T11.1 — study purpose, recording disclosure, and consent. Per REQUIREMENTS.md's
 * flow, the primary button click *is* the consent action (no separate checkbox
 * gate) — the screener form (T11.2) that follows only ever gets reached after
 * this, so its submission always sends `consentGiven: true`.
 */
export function IntroScreen({
  title,
  description,
  onAgree,
  copy,
  channel = "voice",
}: {
  title: string;
  description: string;
  onAgree: () => void;
  /** The study's custom wording; anything it leaves out uses the standard text. */
  copy?: ParticipantCopy | null;
  /** `"text"` for the study's typed-chat link: written-chat wording, a note that the session has a time limit, and no FAQ link (the FAQ describes the voice call). */
  channel?: "voice" | "text";
}) {
  const isText = channel === "text";
  const { tagline, facts, steps, consentNote } = resolveIntroCopy(copy, description, channel);
  return (
    <div className="text-left">
      <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        <span className="inline-block h-px w-5 bg-neutral-400 dark:bg-neutral-600" />
        discoverFirst.co &middot; research study
      </p>

      <h1 className="mt-4 text-2xl font-semibold text-balance">{title || "Research study"}</h1>

      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">{tagline}</p>

      {isText && (
        <p className="mt-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          The chat ends automatically after {DISCOVERY_TEXT_HARD_CAP_MINUTES} minutes, and a timer
          shows how much time is left. Most conversations are much shorter.
        </p>
      )}

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

      <p className="mt-6 border-t border-neutral-200 pt-5 text-xs font-bold tracking-widest text-neutral-400 uppercase dark:border-neutral-800 dark:text-neutral-500">
        How it works
      </p>

      <ol className="mt-4 space-y-4">
        {steps.map((step, i) => (
          <li key={step.title} className="grid grid-cols-[2rem_1fr] gap-3">
            <span className="text-2xl leading-none font-semibold text-neutral-400 dark:text-neutral-600">
              {i + 1}
            </span>
            <div>
              <h2 className="text-sm font-semibold">{step.title}</h2>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <button
        onClick={onAgree}
        className="mt-8 rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        Start the interview
      </button>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{consentNote}</p>

      <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <span>{isText ? "Questions?" : "Want the full details?"}</span>
        {!isText && (
          <>
            <a href="/interview/faq" className="font-semibold underline hover:no-underline">
              Read the FAQ
            </a>
            <span>&middot;</span>
          </>
        )}
        <a
          href="mailto:jkim@discoverfirst.co"
          className="font-semibold underline hover:no-underline"
        >
          jkim@discoverfirst.co
        </a>
      </p>
    </div>
  );
}
