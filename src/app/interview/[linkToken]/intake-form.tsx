"use client";

import { useState } from "react";
import type { Interview } from "@/domain";
// Imported from its own module, not the `@/participant-intake` barrel —
// this is a Client Component, and the barrel also re-exports
// `start-interview.ts`, which transitively pulls in `@/study-service`'s
// barrel and its `node:crypto`-using `link-token.ts` (see M10's PROGRESS.md
// for the same bug hit with `@/study-service`).
import { validateIntake } from "@/participant-intake/intake-validation";

interface IntakeFormValues {
  firstName: string;
  email: string;
}

const EMPTY_VALUES: IntakeFormValues = { firstName: "", email: "" };

/**
 * T11.2 — reached only after the intro screen's consent gate, so every
 * submission sends `consentGiven: true`. Role/responsibility (M13) is no
 * longer collected here — the interviewer asks for it conversationally as
 * the opening question instead (see system-prompt.ts).
 */
export function IntakeForm({
  linkToken,
  onStarted,
}: {
  linkToken: string;
  onStarted: (interview: Interview) => void;
}) {
  const [values, setValues] = useState<IntakeFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const result = validateIntake(values);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    setErrors([]);
    setSubmitting(true);
    const res = await fetch(`/api/studies/${linkToken}/interviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, consentGiven: true }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        fields?: string[];
      } | null;
      setErrors(body?.fields ?? [body?.error ?? "Something went wrong. Please try again."]);
      return;
    }

    onStarted((await res.json()) as Interview);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">A little about you</h1>
      {/* noValidate: the `type="email"` field's native browser validation would
          silently block the submit event before handleSubmit ever runs, bypassing
          our own validateIntake messaging entirely. */}
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4 text-left">
        <label className="block text-sm">
          First name
          <input
            type="text"
            value={values.firstName}
            onChange={(e) => setValues({ ...values, firstName: e.target.value })}
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <label className="block text-sm">
          Email
          <input
            type="email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        {errors.length > 0 && (
          <ul role="alert" className="list-inside list-disc text-sm text-red-600 dark:text-red-400">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {submitting ? "Starting…" : "Start interview"}
        </button>
      </form>
    </div>
  );
}
