"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TranscriptEntry } from "@/domain";

/**
 * Per-turn editable view of the auto-redacted transcript — the PM can fix
 * up any line before it's saved and printed. Only `text` is ever editable;
 * `speaker` is shown read-only and never sent back to the server (see
 * the redacted-transcript API route, which always takes speaker/timestamp
 * from the real transcript, never from client input).
 */
export function RedactedTranscriptEditor({
  studyId,
  interviewId,
  speakers,
  initialTexts,
  autoRedactedTexts,
}: {
  studyId: string;
  interviewId: string;
  speakers: TranscriptEntry["speaker"][];
  initialTexts: string[];
  autoRedactedTexts: string[];
}) {
  const router = useRouter();
  const [texts, setTexts] = useState<string[]>(initialTexts);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateText(index: number, value: string) {
    setTexts((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  function resetToAutoRedacted() {
    setTexts(autoRedactedTexts);
  }

  async function handleSave() {
    setError(null);
    setSaving(true);

    const res = await fetch(
      `/api/studies/${studyId}/interviews/${interviewId}/redacted-transcript`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
      },
    );

    if (!res.ok) {
      setSaving(false);
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Failed to save the redacted transcript.");
      return;
    }

    router.push(`/dashboard/studies/${studyId}/interviews/${interviewId}/export`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {texts.map((text, index) => (
          <li key={index}>
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {speakers[index] === "interviewer" ? "Interviewer" : "Participant"}
            </p>
            <textarea
              value={text}
              onChange={(e) => updateText(index, e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
          </li>
        ))}
      </ol>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={resetToAutoRedacted}
          className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          Reset to auto-redacted
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
