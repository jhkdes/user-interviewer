"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GenerateReportButton({ studyId }: { studyId: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/studies/${studyId}/report`, { method: "POST" });
    setSubmitting(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to generate report.");
      return;
    }

    // The new report is fetched server-side by the study detail page — a
    // Server Component refresh picks it up without any client-side state.
    router.refresh();
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={submitting}
        className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
      >
        {submitting ? "Generating…" : "Generate study report"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
