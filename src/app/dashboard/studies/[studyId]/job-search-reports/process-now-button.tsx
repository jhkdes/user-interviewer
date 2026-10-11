"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Safety limit on how many reports one click works through. */
const MAX_REPORTS_PER_CLICK = 10;

interface SweepResult {
  enqueued: number;
  skipped: number;
  processed: { outcome: string } | null;
}

/**
 * Queues new interviews and works through the waiting reports now, instead of
 * waiting for the scheduler. Each request handles one report (about 2 to 4
 * minutes), so this asks again until none are left.
 */
export function ProcessNowButton({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    const outcomes: string[] = [];
    let failed = false;

    for (let i = 0; i < MAX_REPORTS_PER_CLICK; i++) {
      setMessage(
        i === 0 ? "Working on the first report…" : `Done with ${i}. Working on the next report…`,
      );
      let result: SweepResult;
      try {
        const res = await fetch(`/api/studies/${studyId}/job-search-reports`, { method: "POST" });
        if (!res.ok) throw new Error(String(res.status));
        result = (await res.json()) as SweepResult;
      } catch {
        failed = true;
        break;
      }
      router.refresh();
      if (!result.processed) break;
      outcomes.push(result.processed.outcome);
    }

    setBusy(false);
    const done = outcomes.length;
    const summary =
      done === 0
        ? "Nothing to process."
        : `Processed ${done} report${done === 1 ? "" : "s"} (${outcomes.join(", ")}).`;
    setMessage(failed ? `${summary} Processing then failed; try again.` : summary);
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {busy ? "Processing… (a few minutes per report)" : "Process now"}
      </button>
      {message && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>}
    </div>
  );
}
