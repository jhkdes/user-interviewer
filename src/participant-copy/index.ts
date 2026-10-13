import type { IntroStep, ParticipantCopy } from "@/domain/participant-copy";

/**
 * The default wording of the participant-facing landing and ending pages, and
 * the pure helpers that combine a study's custom copy with it. Nothing here
 * touches the network or the database, so the participant screens, the
 * dashboard editor, and the API all share it.
 */

export const DEFAULT_INTRO_FACTS = ["~15 minutes", "Voice, not text", "No login", "Confidential"];

export const DEFAULT_INTRO_STEPS: IntroStep[] = [
  { title: "Click the link", body: "No signup — just your name and a few quick questions." },
  { title: "Talk with an AI", body: "A real ~15-minute conversation, not a script." },
  {
    title: "Speak freely",
    body: "Nothing goes to your employer; quotes are never attributed to you.",
  },
  { title: "Get something back", body: "Your own summary now, the full report once it's done." },
];

export const DEFAULT_CONSENT_NOTE =
  "The call is recorded (audio and transcript) so we can review it afterward. Starting means you're okay with that.";

export const DEFAULT_COMPLETION_TITLE = "Thank you, you're done!";

export const defaultTagline = (description: string): string =>
  `A 15-minute AI-run interview about ${description || "your day-to-day work"}.`;

export const defaultCompletionMessage = (mode: "voice" | "text" = "voice"): string =>
  `We really appreciate you taking the time to ${mode === "text" ? "chat" : "talk"} with us. We'll follow up by email with what we learn — thanks for being a part of this.`;

export interface ResolvedIntroCopy {
  tagline: string;
  facts: string[];
  steps: IntroStep[];
  consentNote: string;
}

export interface ResolvedCompletionCopy {
  title: string;
  message: string;
}

const text = (value: string | undefined): string | null => (value?.trim() ? value.trim() : null);

/** The landing page's text: the study's custom copy where it has any, the default otherwise. */
export function resolveIntroCopy(
  copy: ParticipantCopy | null | undefined,
  description: string,
): ResolvedIntroCopy {
  const intro = copy?.intro;
  return {
    tagline: text(intro?.tagline) ?? defaultTagline(description),
    facts: intro?.facts?.length ? intro.facts : DEFAULT_INTRO_FACTS,
    steps: intro?.steps?.length ? intro.steps : DEFAULT_INTRO_STEPS,
    consentNote: text(intro?.consentNote) ?? DEFAULT_CONSENT_NOTE,
  };
}

/** The ending page's text: custom where the study has it, the default otherwise. */
export function resolveCompletionCopy(
  copy: ParticipantCopy | null | undefined,
  mode: "voice" | "text" = "voice",
): ResolvedCompletionCopy {
  const completion = copy?.completion;
  return {
    title: text(completion?.title) ?? DEFAULT_COMPLETION_TITLE,
    message: text(completion?.message) ?? defaultCompletionMessage(mode),
  };
}

export const LIMITS = {
  tagline: 300,
  fact: 40,
  maxFacts: 6,
  stepTitle: 60,
  stepBody: 500,
  maxSteps: 6,
  consentNote: 600,
  completionTitle: 100,
  completionMessage: 900,
} as const;

export type CopyValidation =
  { valid: true; value: ParticipantCopy | null } | { valid: false; errors: string[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Checks and tidies copy submitted from the editor: strings are trimmed and
 * empty ones dropped (so they fall back to the default), lists are capped, and
 * anything over its length limit is reported. `null`, or copy with nothing in
 * it, means "use the defaults" and comes back as null.
 */
export function validateParticipantCopy(raw: unknown): CopyValidation {
  if (raw === null || raw === undefined) return { valid: true, value: null };
  if (!isObject(raw)) return { valid: false, errors: ["copy must be an object"] };

  const errors: string[] = [];
  const str = (value: unknown, label: string, max: number): string | undefined => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") {
      errors.push(`${label} must be text`);
      return undefined;
    }
    const trimmed = value.trim();
    if (trimmed.length > max) errors.push(`${label} is longer than ${max} characters`);
    return trimmed || undefined;
  };

  const out: ParticipantCopy = {};

  if (raw.intro !== undefined && raw.intro !== null) {
    if (!isObject(raw.intro)) errors.push("intro must be an object");
    else {
      const intro: NonNullable<ParticipantCopy["intro"]> = {};
      const tagline = str(raw.intro.tagline, "tagline", LIMITS.tagline);
      if (tagline) intro.tagline = tagline;
      const consentNote = str(raw.intro.consentNote, "consent note", LIMITS.consentNote);
      if (consentNote) intro.consentNote = consentNote;

      if (raw.intro.facts !== undefined && raw.intro.facts !== null) {
        if (!Array.isArray(raw.intro.facts)) errors.push("facts must be a list");
        else {
          const facts = raw.intro.facts
            .map((fact, i) => str(fact, `fact ${i + 1}`, LIMITS.fact))
            .filter((fact): fact is string => fact !== undefined);
          if (facts.length > LIMITS.maxFacts) errors.push(`at most ${LIMITS.maxFacts} facts`);
          if (facts.length > 0) intro.facts = facts;
        }
      }

      if (raw.intro.steps !== undefined && raw.intro.steps !== null) {
        if (!Array.isArray(raw.intro.steps)) errors.push("steps must be a list");
        else {
          const steps: IntroStep[] = [];
          raw.intro.steps.forEach((step, i) => {
            if (!isObject(step)) {
              errors.push(`step ${i + 1} must be an object`);
              return;
            }
            const title = str(step.title, `step ${i + 1} title`, LIMITS.stepTitle);
            const body = str(step.body, `step ${i + 1} text`, LIMITS.stepBody);
            if (!title && !body) return;
            if (!title || !body) errors.push(`step ${i + 1} needs both a title and text`);
            else steps.push({ title, body });
          });
          if (steps.length > LIMITS.maxSteps) errors.push(`at most ${LIMITS.maxSteps} steps`);
          if (steps.length > 0) intro.steps = steps;
        }
      }
      if (Object.keys(intro).length > 0) out.intro = intro;
    }
  }

  if (raw.completion !== undefined && raw.completion !== null) {
    if (!isObject(raw.completion)) errors.push("completion must be an object");
    else {
      const completion: NonNullable<ParticipantCopy["completion"]> = {};
      const title = str(raw.completion.title, "ending title", LIMITS.completionTitle);
      if (title) completion.title = title;
      const message = str(raw.completion.message, "ending message", LIMITS.completionMessage);
      if (message) completion.message = message;
      if (Object.keys(completion).length > 0) out.completion = completion;
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, value: Object.keys(out).length > 0 ? out : null };
}

/**
 * Drops every field that equals its default, so a study that saves the text
 * it started with keeps following the defaults instead of freezing them.
 * Returns null when nothing differs.
 */
export function withoutDefaults(
  copy: ParticipantCopy,
  description: string,
): ParticipantCopy | null {
  const same = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  const out: ParticipantCopy = {};

  if (copy.intro) {
    const intro: NonNullable<ParticipantCopy["intro"]> = {};
    if (copy.intro.tagline && copy.intro.tagline !== defaultTagline(description)) {
      intro.tagline = copy.intro.tagline;
    }
    if (copy.intro.facts?.length && !same(copy.intro.facts, DEFAULT_INTRO_FACTS)) {
      intro.facts = copy.intro.facts;
    }
    if (copy.intro.steps?.length && !same(copy.intro.steps, DEFAULT_INTRO_STEPS)) {
      intro.steps = copy.intro.steps;
    }
    if (copy.intro.consentNote && copy.intro.consentNote !== DEFAULT_CONSENT_NOTE) {
      intro.consentNote = copy.intro.consentNote;
    }
    if (Object.keys(intro).length > 0) out.intro = intro;
  }

  if (copy.completion) {
    const completion: NonNullable<ParticipantCopy["completion"]> = {};
    if (copy.completion.title && copy.completion.title !== DEFAULT_COMPLETION_TITLE) {
      completion.title = copy.completion.title;
    }
    if (copy.completion.message && copy.completion.message !== defaultCompletionMessage("voice")) {
      completion.message = copy.completion.message;
    }
    if (Object.keys(completion).length > 0) out.completion = completion;
  }

  return Object.keys(out).length > 0 ? out : null;
}
