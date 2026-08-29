"use client";

import { useState } from "react";
import type { Interview } from "@/domain";
// Imported from their own modules, not the `@/participant-intake` barrel —
// this is a Client Component, and the barrel also re-exports
// `start-interview.ts`, which transitively pulls in `@/study-service`'s
// barrel and its `node:crypto`-using `link-token.ts` (see M10's PROGRESS.md
// for the same bug hit with `@/study-service`).
import { validateIntake } from "@/participant-intake/intake-validation";
import { SCREENER_QUESTIONS } from "@/participant-intake/screener-questions";

interface IntakeFormValues {
  firstName: string;
  email: string;
}

const EMPTY_VALUES: IntakeFormValues = { firstName: "", email: "" };

const OTHER_OPTION = "Other";

/**
 * T11.2 — reached only after the intro screen's consent gate, so every
 * submission sends `consentGiven: true`. Role/responsibility (M13) is no
 * longer collected here — the interviewer asks for it conversationally as
 * the opening question instead (see system-prompt.ts). Below name/email,
 * renders the (all-optional) pre-call screener questionnaire, shared with
 * the AI interviewer as context (see screener-questions.ts).
 */
export function IntakeForm({
  linkToken,
  deviceType,
  onStarted,
}: {
  linkToken: string;
  deviceType: "desktop" | "mobile";
  onStarted: (interview: Interview) => void;
}) {
  const [values, setValues] = useState<IntakeFormValues>(EMPTY_VALUES);
  const [screenerAnswers, setScreenerAnswers] = useState<Record<string, string | string[]>>({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function setSingleAnswer(questionId: string, option: string) {
    setScreenerAnswers((prev) => {
      const next = { ...prev };
      if (option) next[questionId] = option;
      else delete next[questionId];
      return next;
    });
  }

  function toggleMultiAnswer(questionId: string, option: string, checked: boolean) {
    setScreenerAnswers((prev) => {
      const current = (prev[questionId] as string[] | undefined) ?? [];
      const next = checked ? [...current, option] : current.filter((o) => o !== option);
      return next.length > 0 ? { ...prev, [questionId]: next } : omit(prev, questionId);
    });
  }

  /** Shows the "Other" free-text input for a question, without recording an answer until text is typed. */
  function enableOther(questionId: string) {
    setOtherText((prev) => ({ ...prev, [questionId]: "" }));
  }

  /** Hides the "Other" free-text input and removes any answer it had contributed. */
  function disableOther(questionId: string, type: "single" | "multi") {
    setOtherText((prev) => omit(prev, questionId));
    setScreenerAnswers((prev) => {
      if (type === "single") return omit(prev, questionId);
      const current = ((prev[questionId] as string[] | undefined) ?? []).filter(
        (o) => !o.startsWith("Other:"),
      );
      return current.length > 0 ? { ...prev, [questionId]: current } : omit(prev, questionId);
    });
  }

  function updateOtherText(questionId: string, type: "single" | "multi", text: string) {
    setOtherText((prev) => ({ ...prev, [questionId]: text }));
    const value = text.trim() ? `Other: ${text.trim()}` : "";
    setScreenerAnswers((prev) => {
      if (type === "single") {
        const next = { ...prev };
        if (value) next[questionId] = value;
        else delete next[questionId];
        return next;
      }
      const current = ((prev[questionId] as string[] | undefined) ?? []).filter(
        (o) => !o.startsWith("Other:"),
      );
      const next = value ? [...current, value] : current;
      return next.length > 0 ? { ...prev, [questionId]: next } : omit(prev, questionId);
    });
  }

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
      body: JSON.stringify({
        ...values,
        consentGiven: true,
        deviceType,
        screenerAnswers: Object.keys(screenerAnswers).length > 0 ? screenerAnswers : undefined,
      }),
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

        <p className="pt-2 text-xs text-neutral-500 dark:text-neutral-400">
          A few optional questions to help us understand who we&apos;re talking with:
        </p>

        {SCREENER_QUESTIONS.map((question) =>
          question.type === "single" ? (
            <label key={question.id} className="block text-sm">
              {question.label}
              <select
                value={
                  otherText[question.id]
                    ? OTHER_OPTION
                    : ((screenerAnswers[question.id] as string | undefined) ?? "")
                }
                onChange={(e) => {
                  if (e.target.value === OTHER_OPTION) {
                    enableOther(question.id);
                  } else {
                    disableOther(question.id, "single");
                    setSingleAnswer(question.id, e.target.value);
                  }
                }}
                className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
              >
                <option value="">Prefer not to say</option>
                {question.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
                {question.allowOther && <option value={OTHER_OPTION}>Other</option>}
              </select>
              {question.allowOther && otherText[question.id] !== undefined && (
                <input
                  type="text"
                  value={otherText[question.id]}
                  onChange={(e) => updateOtherText(question.id, "single", e.target.value)}
                  placeholder="Please specify"
                  className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
                />
              )}
            </label>
          ) : (
            <fieldset key={question.id} className="text-sm">
              <legend>{question.label}</legend>
              <div className="mt-1 space-y-1">
                {question.options.map((option) => (
                  <label key={option} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={((screenerAnswers[question.id] as string[] | undefined) ?? [])
                        .filter((o) => !o.startsWith("Other:"))
                        .includes(option)}
                      onChange={(e) => toggleMultiAnswer(question.id, option, e.target.checked)}
                    />
                    {option}
                  </label>
                ))}
                {question.allowOther && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={otherText[question.id] !== undefined}
                      onChange={(e) =>
                        e.target.checked
                          ? enableOther(question.id)
                          : disableOther(question.id, "multi")
                      }
                    />
                    Other
                  </label>
                )}
                {question.allowOther && otherText[question.id] !== undefined && (
                  <input
                    type="text"
                    value={otherText[question.id]}
                    onChange={(e) => updateOtherText(question.id, "multi", e.target.value)}
                    placeholder="Please specify"
                    className="block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
                  />
                )}
              </div>
            </fieldset>
          ),
        )}

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

function omit<T extends Record<string, unknown>>(obj: T, key: string): T {
  const rest = { ...obj };
  delete rest[key];
  return rest;
}
