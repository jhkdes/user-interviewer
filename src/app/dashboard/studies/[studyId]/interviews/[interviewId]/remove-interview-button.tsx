"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RemoveInterviewButton({
  studyId,
  interviewId,
}: {
  studyId: string;
  interviewId: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (
      !confirm(
        "Remove this interview? This permanently deletes its transcript, recording reference, and summary — this can't be undone.",
      )
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const res = await fetch(`/api/studies/${studyId}/interviews/${interviewId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      setSubmitting(false);
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to remove interview.");
      return;
    }

    router.push(`/dashboard/studies/${studyId}`);
    router.refresh();
  }

  return (
    <div className="mt-6">
      <button
        onClick={handleClick}
        disabled={submitting}
        className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        {submitting ? "Removing…" : "Remove interview"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
