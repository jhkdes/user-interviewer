"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Queues new interviews and works on one report now, instead of waiting for the scheduler. Takes a few minutes. */
export function ProcessNowButton({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/studies/${studyId}/job-search-reports`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setMessage("Processing failed. Try again.");
      return;
    }
    const result = (await res.json()) as {
      enqueued: number;
      skipped: number;
      processed: { outcome: string } | null;
    };
    setMessage(
      result.processed
        ? `Worked on one report (${result.processed.outcome}). ${result.enqueued} new queued.`
        : `Nothing to process. ${result.enqueued} new queued.`,
    );
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={run}
        disabled={busy}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {busy ? "Processing… (takes a few minutes)" : "Process now"}
      </button>
      {message && <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{message}</p>}
    </div>
  );
}
