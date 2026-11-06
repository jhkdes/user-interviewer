"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntroStep, ParticipantCopy } from "@/domain";
import { CompletionScreen } from "@/app/interview/[linkToken]/completion-screen";
import { FeedbackIntroScreen } from "@/app/interview/[linkToken]/feedback-intro-screen";
import {
  LIMITS,
  mergeTextCopy,
  resolveCompletionCopy,
  resolveFeedbackIntroCopy,
  withoutFeedbackDefaults,
} from "@/participant-copy";

const FIELD =
  "mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const BTN = "rounded px-3 py-1.5 text-sm disabled:opacity-60";
const PRIMARY = `${BTN} bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200`;
const SECONDARY = `${BTN} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`;

/** Same limit the server enforces on the two scripted interviewer lines. */
const LINE_MAX = 300;

interface FormState {
  brandLabel: string;
  tagline: string;
  facts: string[];
  steps: IntroStep[];
  consentNote: string;
  contactEmail: string;
  showFaq: boolean;
  completionTitle: string;
  completionMessage: string;
  firstMessage: string;
  closingQuestion: string;
}

/** The fields as a participant would see them: the custom copy where there is any, the standard wording otherwise. */
function stateFrom(
  copy: ParticipantCopy | null,
  description: string,
  channel: "voice" | "text",
  firstMessage: string | null,
  closingQuestion: string | null,
): FormState {
  const intro = resolveFeedbackIntroCopy(copy, description, channel);
  const completion = resolveCompletionCopy(copy, channel);
  return {
    brandLabel: intro.brandLabel,
    tagline: intro.tagline,
    facts: intro.facts,
    steps: intro.steps,
    consentNote: intro.consentNote,
    contactEmail: intro.contactEmail ?? "",
    showFaq: intro.showFaq,
    completionTitle: completion.title,
    completionMessage: completion.message,
    firstMessage: firstMessage ?? "",
    closingQuestion: closingQuestion ?? "",
  };
}

function copyFrom(state: FormState): ParticipantCopy {
  return {
    intro: {
      brandLabel: state.brandLabel,
      tagline: state.tagline,
      facts: state.facts,
      steps: state.steps,
      consentNote: state.consentNote,
      contactEmail: state.contactEmail,
      showFaq: state.showFaq,
    },
    completion: { title: state.completionTitle, message: state.completionMessage },
  };
}

/** Lets a PM edit a feedback study's landing and ending pages and its two scripted interviewer lines. */
export function FeedbackPagesForm({
  studyId,
  title,
  description,
  linkToken,
  initialCopy,
  channel = "voice",
  voiceCopy = null,
  voiceProvider,
  initialFirstMessage,
  initialClosingQuestion,
}: {
  studyId: string;
  title: string;
  description: string;
  linkToken: string;
  initialCopy: ParticipantCopy | null;
  /** Which of the study's two links this edits. The text link's pages follow the voice link's wherever they have no copy of their own. */
  channel?: "voice" | "text";
  /** The voice link's stored copy: what the text link shows where it has none of its own. */
  voiceCopy?: ParticipantCopy | null;
  voiceProvider: "vapi" | "elevenlabs";
  initialFirstMessage: string | null;
  initialClosingQuestion: string | null;
}) {
  const router = useRouter();
  const isText = channel === "text";
  const fallbackCopy = isText ? voiceCopy : null;
  const [state, setState] = useState<FormState>(() =>
    stateFrom(
      isText ? mergeTextCopy(initialCopy, voiceCopy) : initialCopy,
      description,
      channel,
      initialFirstMessage,
      initialClosingQuestion,
    ),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  // The opening line is spoken, so only the voice link has one.
  const canSetOpeningLine = voiceProvider === "elevenlabs" && !isText;

  const patch = (changes: Partial<FormState>) => setState((s) => ({ ...s, ...changes }));

  async function put(path: string, payload: unknown): Promise<string[]> {
    const res = await fetch(`/api/studies/${studyId}/${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return [];
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      fields?: string[];
    } | null;
    return body?.fields ?? [body?.error ?? "Failed to save."];
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    setErrors([]);
    // Text that equals the standard wording is not saved, so it keeps following the standard.
    const copyErrors = await put("participant-copy", {
      participantCopy: withoutFeedbackDefaults(copyFrom(state), description, channel, fallbackCopy),
      channel,
    });
    const lineErrors = await put("interviewer-lines", {
      ...(canSetOpeningLine ? { firstMessage: state.firstMessage.trim() || null } : {}),
      closingQuestion: state.closingQuestion.trim() || null,
    });
    setSaving(false);
    const all = [...copyErrors, ...lineErrors];
    if (all.length > 0) {
      setErrors(all);
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
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Clicking <strong>Start</strong> is the participant&apos;s consent, and it happens before
          they enter a name or email. The consent note sits under that button, so word it for that
          moment.
        </p>
        <label className="block text-sm">
          Label above the title
          <input
            className={FIELD}
            maxLength={LIMITS.brandLabel}
            value={state.brandLabel}
            onChange={(e) => patch({ brandLabel: e.target.value })}
          />
        </label>
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
            How it works (optional, up to {LIMITS.maxSteps} steps)
          </legend>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            The feedback page shows no steps unless you add some.
          </p>
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
          Recording and consent note (under the Start button)
          <textarea
            className={FIELD}
            rows={3}
            maxLength={LIMITS.consentNote}
            value={state.consentNote}
            onChange={(e) => patch({ consentNote: e.target.value })}
          />
        </label>

        <div>
          <label className="block text-sm">
            Contact email (optional)
            <input
              type="email"
              className={FIELD}
              maxLength={LIMITS.contactEmail}
              value={state.contactEmail}
              onChange={(e) => patch({ contactEmail: e.target.value })}
            />
          </label>
          <span className="mt-1 block text-xs text-neutral-500">
            Adds a &ldquo;Questions?&rdquo; line with this address under the consent note.
          </span>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state.showFaq}
            onChange={(e) => patch({ showFaq: e.target.checked })}
          />
          Link to the discoverFirst FAQ
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

      <section className="space-y-4">
        <h2 className="font-semibold">What the interviewer says</h2>
        <div>
          <label className="block text-sm">
            Opening line
            <textarea
              className={FIELD}
              rows={2}
              maxLength={LINE_MAX}
              disabled={!canSetOpeningLine}
              placeholder="Leave blank to keep the voice agent's built-in greeting"
              value={state.firstMessage}
              onChange={(e) => patch({ firstMessage: e.target.value })}
            />
          </label>
          <span className="mt-1 block text-xs text-neutral-500">
            {canSetOpeningLine
              ? "The first thing the interviewer says. Use {{participant_name}} for the person's first name."
              : isText
                ? "The text link has no spoken opening line."
                : "Only studies on ElevenLabs can set an opening line."}
          </span>
        </div>
        <div>
          <label className="block text-sm">
            Closing question
            <textarea
              className={FIELD}
              rows={2}
              maxLength={LINE_MAX}
              placeholder="Leave blank to ask: Before we wrap up, is there anything else on your mind about today's session?"
              value={state.closingQuestion}
              onChange={(e) => patch({ closingQuestion: e.target.value })}
            />
          </label>
          <span className="mt-1 block text-xs text-neutral-500">
            Asked once, after the interviewer has covered its questions; the call ends after the
            answer. Use {"{{participant_name}}"} for the person&apos;s first name.
          </span>
        </div>
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
          onClick={() => setState(stateFrom(null, description, channel, null, null))}
        >
          Reset to the standard wording
        </button>
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Reset fills in the standard wording; nothing changes for participants until you click Save.
        The opening line and closing question apply to interviews that start after you save.
      </p>

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
          <FeedbackIntroScreen
            title={title}
            description={description}
            channel={channel}
            copy={copyFrom(state)}
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
