const STEPS = [
  { title: "Click the link", body: "No signup — just your name and a few quick questions." },
  { title: "Talk with an AI", body: "A real ~15-minute conversation, not a script." },
  {
    title: "Speak freely",
    body: "Nothing goes to your employer; quotes are never attributed to you.",
  },
  { title: "Get something back", body: "Your own summary now, the full report once it's done." },
];

/**
 * T11.1 — study purpose, recording disclosure, and consent. Per REQUIREMENTS.md's
 * flow, the primary button click *is* the consent action (no separate checkbox
 * gate) — the screener form (T11.2) that follows only ever gets reached after
 * this, so its submission always sends `consentGiven: true`.
 */
export function IntroScreen({ onAgree }: { onAgree: () => void }) {
  return (
    <div className="text-left">
      <p className="flex items-center gap-2 text-xs font-bold tracking-widest text-neutral-500 uppercase dark:text-neutral-400">
        <span className="inline-block h-px w-5 bg-neutral-400 dark:bg-neutral-600" />
        discoverFirst.co &middot; research study
      </p>

      <h1 className="mt-4 text-2xl font-semibold text-balance">
        How AI Actually Shows Up in a PM&rsquo;s Day
      </h1>

      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
        A 15-minute AI-run interview about how product managers really use AI at work — the good,
        the bad, and what they don&rsquo;t say out loud.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {["~15 minutes", "Voice, not text", "No login", "Confidential"].map((fact) => (
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
        {STEPS.map((step, i) => (
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
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        The call is recorded (audio and transcript) so we can review it afterward. Starting means
        you&apos;re okay with that.
      </p>

      <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <span>Want the full details?</span>
        <a href="/interview/faq" className="font-semibold underline hover:no-underline">
          Read the FAQ
        </a>
        <span>&middot;</span>
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
