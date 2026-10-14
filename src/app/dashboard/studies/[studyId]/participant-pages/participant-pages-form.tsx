"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntroStep, ParticipantCopy } from "@/domain";
import { CompletionScreen } from "@/app/interview/[linkToken]/completion-screen";
import { IntroScreen } from "@/app/interview/[linkToken]/intro-screen";
import {
  JOB_SEARCH_PARTICIPANT_COPY,
  JOB_SEARCH_TEXT_PARTICIPANT_COPY,
} from "@/job-search-study/participant-copy";
import {
  LIMITS,
  mergeTextCopy,
  resolveCompletionCopy,
  resolveIntroCopy,
  withoutDefaults,
} from "@/participant-copy";

const FIELD =
  "mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const BTN = "rounded px-3 py-1.5 text-sm disabled:opacity-60";
const PRIMARY = `${BTN} bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200`;
const SECONDARY = `${BTN} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`;

interface FormState {
  tagline: string;
  facts: string[];
  steps: IntroStep[];
  consentNote: string;
  completionTitle: string;
  completionMessage: string;
}

/** The fields as a participant would see them: the custom copy where there is any, the standard wording otherwise. */
function stateFrom(
  copy: ParticipantCopy | null,
  description: string,
  channel: "voice" | "text",
): FormState {
  const intro = resolveIntroCopy(copy, description, channel);
  const completion = resolveCompletionCopy(copy, channel);
  return {
    tagline: intro.tagline,
    facts: intro.facts,
    steps: intro.steps,
    consentNote: intro.consentNote,
    completionTitle: completion.title,
    completionMessage: completion.message,
  };
}

function copyFrom(state: FormState): ParticipantCopy {
  return {
    intro: {
      tagline: state.tagline,
      facts: state.facts,
      steps: state.steps,
      consentNote: state.consentNote,
    },
    completion: { title: state.completionTitle, message: state.completionMessage },
  };
}

export function ParticipantPagesForm({
  studyId,
  title,
  description,
  linkToken,
  initialCopy,
  channel = "voice",
  voiceCopy = null,
}: {
  studyId: string;
  title: string;
  description: string;
  /** The token of the link being edited, for the "open the live page" link. */
  linkToken: string;
  /** The stored copy of the link being edited. */
  initialCopy: ParticipantCopy | null;
  /** Which of the study's two links this edits. The text link's pages follow the voice link's wherever they have no copy of their own. */
  channel?: "voice" | "text";
  /** The voice link's stored copy: what the text link shows where it has none of its own. */
  voiceCopy?: ParticipantCopy | null;
}) {
  const router = useRouter();
  const isText = channel === "text";
  /** What the pages show when this link has no copy of its own: the standard wording, or for the text link the voice link's. */
  const fallbackCopy = isText ? voiceCopy : null;
  const [state, setState] = useState<FormState>(() =>
    stateFrom(isText ? mergeTextCopy(initialCopy, voiceCopy) : initialCopy, description, channel),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const patch = (changes: Partial<FormState>) => setState((s) => ({ ...s, ...changes }));

  async function save() {
    setSaving(true);
    setMessage(null);
    setErrors([]);
    const res = await fetch(`/api/studies/${studyId}/participant-copy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      // Text that equals the standard wording is not saved, so it keeps following the standard.
      body: JSON.stringify({
        participantCopy: withoutDefaults(copyFrom(state), description, channel, fallbackCopy),
        channel,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        fields?: string[];
      } | null;
      setErrors(body?.fields ?? [body?.error ?? "Failed to save."]);
      return;
    }
    setMessage(
      isText
        ? "Saved. Participants see this wording the next time they open the text link."
        : "Saved. Participants see this wording the next time they open the link.",
    );
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="font-semibold">Landing page</h2>
        <label className="block text-sm">
          Sentence under the title
          <textarea
            className={FIELD}
            rows={3}
            maxLength={LIMITS.tagline}
            value={state.tagline}
            onChange={(e) => patch({ tagline: e.target.value })}
          />
        </label>

        <fieldset className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
          <legend className="px-1 text-sm font-medium">
            Short facts (up to {LIMITS.maxFacts})
          </legend>
          {state.facts.map((fact, i) => (
            <div key={i} className="mt-2 flex gap-2">
              <input
                aria-label={`Fact ${i + 1}`}
                className={FIELD.replace("mt-1 ", "")}
                maxLength={LIMITS.fact}
                value={fact}
                onChange={(e) =>
                  patch({ facts: state.facts.map((f, j) => (j === i ? e.target.value : f)) })
                }
              />
              <button
                type="button"
                className={SECONDARY}
                onClick={() => patch({ facts: state.facts.filter((_, j) => j !== i) })}
              >
                Remove
              </button>
            </div>
          ))}
          {state.facts.length < LIMITS.maxFacts && (
            <button
              type="button"
              className={`${SECONDARY} mt-3`}
              onClick={() => patch({ facts: [...state.facts, ""] })}
            >
              Add a fact
            </button>
          )}
        </fieldset>

        <fieldset className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
          <legend className="px-1 text-sm font-medium">
            How it works (up to {LIMITS.maxSteps} steps)
          </legend>
          {state.steps.map((step, i) => (
            <div
              key={i}
              className="mt-3 rounded border border-neutral-200 p-2 dark:border-neutral-800"
            >
              <label className="block text-xs text-neutral-500">
                Step {i + 1} title
                <input
                  className={FIELD}
                  maxLength={LIMITS.stepTitle}
                  value={step.title}
                  onChange={(e) =>
                    patch({
                      steps: state.steps.map((s, j) =>
                        j === i ? { ...s, title: e.target.value } : s,
                      ),
                    })
                  }
                />
              </label>
              <label className="mt-2 block text-xs text-neutral-500">
                Step {i + 1} text
                <textarea
                  className={FIELD}
                  rows={2}
                  maxLength={LIMITS.stepBody}
                  value={step.body}
                  onChange={(e) =>
                    patch({
                      steps: state.steps.map((s, j) =>
                        j === i ? { ...s, body: e.target.value } : s,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className={`${SECONDARY} mt-2`}
                onClick={() => patch({ steps: state.steps.filter((_, j) => j !== i) })}
              >
                Remove step {i + 1}
              </button>
            </div>
          ))}
          {state.steps.length < LIMITS.maxSteps && (
            <button
              type="button"
              className={`${SECONDARY} mt-3`}
              onClick={() => patch({ steps: [...state.steps, { title: "", body: "" }] })}
            >
              Add a step
            </button>
          )}
        </fieldset>

        <label className="block text-sm">
          {isText
            ? "Consent note (under the Start button)"
            : "Recording and consent note (under the Start button)"}
          <textarea
            className={FIELD}
            rows={3}
            maxLength={LIMITS.consentNote}
            value={state.consentNote}
            onChange={(e) => patch({ consentNote: e.target.value })}
          />
        </label>
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold">Ending page</h2>
        <label className="block text-sm">
          Title
          <input
            className={FIELD}
            maxLength={LIMITS.completionTitle}
            value={state.completionTitle}
            onChange={(e) => patch({ completionTitle: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          Message
          <textarea
            className={FIELD}
            rows={5}
            maxLength={LIMITS.completionMessage}
            value={state.completionMessage}
            onChange={(e) => patch({ completionMessage: e.target.value })}
          />
        </label>
      </section>

      {errors.length > 0 && (
        <ul role="alert" className="list-inside list-disc text-sm text-red-600 dark:text-red-400">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      {message && (
        <p className="rounded bg-neutral-100 p-3 text-sm dark:bg-neutral-900">{message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY} disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className={SECONDARY}
          onClick={() =>
            setState(
              stateFrom(
                isText ? JOB_SEARCH_TEXT_PARTICIPANT_COPY : JOB_SEARCH_PARTICIPANT_COPY,
                description,
                channel,
              ),
            )
          }
        >
          Use the job-search wording
        </button>
        {isText && (
          <button
            type="button"
            className={SECONDARY}
            onClick={() =>
              setState(stateFrom(mergeTextCopy(null, voiceCopy), description, channel))
            }
          >
            Match the voice link
          </button>
        )}
        <button
          type="button"
          className={SECONDARY}
          onClick={() => setState(stateFrom(null, description, channel))}
        >
          {isText ? "Reset to the standard text wording" : "Reset to the standard wording"}
        </button>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        The wording buttons fill in the fields above; nothing changes for participants until you
        click Save.
        {isText &&
          " Anything you leave as it is follows the voice link's wording, so later changes to the voice link carry over."}
      </p>
      {isText && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          The text link starts from the voice link&apos;s wording. If that wording talks about a
          call, speaking, or a recording (for example &ldquo;Voice, not text&rdquo;), change it here
          before you share the text link.
        </p>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Preview</h2>
          <a
            href={`/interview/${linkToken}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline hover:no-underline"
          >
            {isText ? "Open the live text landing page" : "Open the live landing page"}
          </a>
        </div>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Updates as you type. Fields you leave blank show the standard wording.
        </p>
        <p className="mt-4 text-xs font-bold tracking-widest text-neutral-400 uppercase">
          Landing page
        </p>
        <div
          data-testid="landing-preview"
          className="mt-2 rounded border border-neutral-200 p-6 dark:border-neutral-800"
        >
          <IntroScreen
            title={title}
            description={description}
            copy={copyFrom(state)}
            channel={channel}
            onAgree={() => undefined}
          />
        </div>
        <p className="mt-6 text-xs font-bold tracking-widest text-neutral-400 uppercase">
          Ending page
        </p>
        <div
          data-testid="ending-preview"
          className="mt-2 rounded border border-neutral-200 p-6 dark:border-neutral-800"
        >
          <CompletionScreen mode={channel} copy={copyFrom(state)} />
        </div>
      </section>
    </div>
  );
}
