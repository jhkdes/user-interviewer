"use client";

import { useState } from "react";
import Link from "next/link";
import type { Study, TargetProfile } from "@/domain";
// Imported from its own module, not the `@/study-service` barrel — this is
// a Client Component, and the barrel also re-exports `link-token.ts`
// (`node:crypto`), which webpack can't bundle for the browser.
import { validateTargetProfile } from "@/study-service/target-profile-validation";
import { StudyLink } from "../../study-link";

const FIELDS: { name: keyof TargetProfile; label: string; placeholder: string }[] = [
  { name: "industry", label: "Industry", placeholder: "e.g. Fintech" },
  { name: "yearsOfExperience", label: "Years of experience", placeholder: "e.g. 5-10 years" },
  { name: "jobTitle", label: "Job title", placeholder: "e.g. Product Manager" },
  { name: "seniority", label: "Seniority", placeholder: "e.g. Senior" },
  {
    name: "responsibility",
    label: "Overall responsibility",
    placeholder: "e.g. Owns the payments roadmap",
  },
];

const EMPTY_PROFILE: TargetProfile = {
  industry: "",
  yearsOfExperience: "",
  jobTitle: "",
  seniority: "",
  responsibility: "",
};

export function NewStudyForm() {
  const [profile, setProfile] = useState<TargetProfile>(EMPTY_PROFILE);
  const [researchTopic, setResearchTopic] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Study | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Pre-validate client-side with the same pure function the API route
    // uses server-side (src/study-service/target-profile-validation.ts), so
    // the messages are identical and a round trip isn't needed just to
    // catch an empty field.
    const result = validateTargetProfile(profile);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }

    setErrors([]);
    setSubmitting(true);
    const res = await fetch("/api/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetProfile: profile,
        ...(researchTopic.trim() ? { researchTopic: researchTopic.trim() } : {}),
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        fields?: string[];
      } | null;
      setErrors(body?.fields ?? [body?.error ?? "Failed to create study."]);
      return;
    }

    setCreated((await res.json()) as Study);
  }

  if (created) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Study created</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          Share this link with people matching the target profile:
        </p>
        <div className="mt-2">
          <StudyLink linkToken={created.linkToken} />
        </div>
        <Link href={`/dashboard/studies/${created.id}`} className="mt-6 inline-block underline">
          Go to study →
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">New Study</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {FIELDS.map((field) => (
          <label key={field.name} className="block text-sm">
            {field.label}
            <input
              type="text"
              placeholder={field.placeholder}
              value={profile[field.name]}
              onChange={(e) => setProfile({ ...profile, [field.name]: e.target.value })}
              className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
        ))}

        <label className="block text-sm">
          Research topic <span className="text-neutral-400">(optional)</span>
          <textarea
            placeholder="e.g. How AI actually shows up in a PM's day — dig into where they use AI tools, where they've abandoned it, and where they're anxious about it"
            value={researchTopic}
            onChange={(e) => setResearchTopic(e.target.value)}
            rows={3}
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
          className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {submitting ? "Creating…" : "Create study"}
        </button>
      </form>
    </div>
  );
}
