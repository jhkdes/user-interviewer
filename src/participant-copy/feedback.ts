import type { IntroStep, ParticipantCopy } from "@/domain/participant-copy";
import { resolveCompletionCopy } from "./index";

/**
 * The feedback-type landing page's wording. Feedback studies have always shown
 * a short fixed screen; these are its defaults, and a study's custom copy
 * (the same `ParticipantCopy` discovery studies use) replaces any field it
 * sets. A study with no copy shows exactly what feedback studies always have.
 */

export const DEFAULT_FEEDBACK_BRAND_LABEL = "discoverFirst.co · quick feedback";

export const DEFAULT_FEEDBACK_FACTS = ["~5 minutes", "Voice, not text", "No login"];
export const DEFAULT_FEEDBACK_TEXT_FACTS = ["~5 minutes", "Typed chat, not voice", "No login"];

export const DEFAULT_FEEDBACK_CONSENT_NOTE =
  "The call is recorded (audio and transcript) so we can review it afterward. Starting means you're okay with that.";
export const DEFAULT_FEEDBACK_TEXT_CONSENT_NOTE =
  "No audio is recorded. The conversation is saved as a transcript so we can review it afterward. Starting means you're okay with that.";

export const feedbackDefaultTagline = (
  description: string,
  channel: "voice" | "text" = "voice",
): string =>
  `A quick, ~5-minute ${channel === "text" ? "written" : "voice"} check-in about ${description || "your experience"} — a few questions, then you're done.`;

export interface ResolvedFeedbackIntroCopy {
  brandLabel: string;
  tagline: string;
  facts: string[];
  /** Empty unless the study supplies steps: the feedback screen has no "How it works" by default. */
  steps: IntroStep[];
  consentNote: string;
  /** Null unless the study sets one. */
  contactEmail: string | null;
  showFaq: boolean;
}

const text = (value: string | undefined): string | null => (value?.trim() ? value.trim() : null);

/** The feedback landing page's text: the study's custom copy where it has any, the standard wording for the link's channel otherwise. */
export function resolveFeedbackIntroCopy(
  copy: ParticipantCopy | null | undefined,
  description: string,
  channel: "voice" | "text" = "voice",
): ResolvedFeedbackIntroCopy {
  const intro = copy?.intro;
  const isText = channel === "text";
  return {
    brandLabel: text(intro?.brandLabel) ?? DEFAULT_FEEDBACK_BRAND_LABEL,
    tagline: text(intro?.tagline) ?? feedbackDefaultTagline(description, channel),
    facts: intro?.facts?.length
      ? intro.facts
      : isText
        ? DEFAULT_FEEDBACK_TEXT_FACTS
        : DEFAULT_FEEDBACK_FACTS,
    steps: intro?.steps?.length ? intro.steps : [],
    consentNote:
      text(intro?.consentNote) ??
      (isText ? DEFAULT_FEEDBACK_TEXT_CONSENT_NOTE : DEFAULT_FEEDBACK_CONSENT_NOTE),
    contactEmail: text(intro?.contactEmail),
    showFaq: intro?.showFaq === true,
  };
}

/**
 * Drops every field that equals what the feedback page shows anyway, so a study
 * that saves the wording it started with keeps following it. For the voice link
 * that is the standard wording; for the text link it is what that link shows
 * with no copy of its own: the voice link's custom copy (pass it as
 * `fallback`), then the text defaults. Returns null when nothing differs.
 */
export function withoutFeedbackDefaults(
  copy: ParticipantCopy,
  description: string,
  channel: "voice" | "text" = "voice",
  fallback: ParticipantCopy | null = null,
): ParticipantCopy | null {
  const base = resolveFeedbackIntroCopy(fallback, description, channel);
  const baseCompletion = resolveCompletionCopy(fallback, channel);
  const same = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  const out: ParticipantCopy = {};

  if (copy.intro) {
    const intro: NonNullable<ParticipantCopy["intro"]> = {};
    if (copy.intro.brandLabel && copy.intro.brandLabel !== base.brandLabel) {
      intro.brandLabel = copy.intro.brandLabel;
    }
    if (copy.intro.tagline && copy.intro.tagline !== base.tagline)
      intro.tagline = copy.intro.tagline;
    if (copy.intro.facts?.length && !same(copy.intro.facts, base.facts)) {
      intro.facts = copy.intro.facts;
    }
    if (copy.intro.steps?.length && !same(copy.intro.steps, base.steps)) {
      intro.steps = copy.intro.steps;
    }
    if (copy.intro.consentNote && copy.intro.consentNote !== base.consentNote) {
      intro.consentNote = copy.intro.consentNote;
    }
    if (copy.intro.contactEmail && copy.intro.contactEmail !== base.contactEmail) {
      intro.contactEmail = copy.intro.contactEmail;
    }
    if (copy.intro.showFaq && !base.showFaq) intro.showFaq = true;
    if (Object.keys(intro).length > 0) out.intro = intro;
  }

  if (copy.completion) {
    const completion: NonNullable<ParticipantCopy["completion"]> = {};
    if (copy.completion.title && copy.completion.title !== baseCompletion.title) {
      completion.title = copy.completion.title;
    }
    if (copy.completion.message && copy.completion.message !== baseCompletion.message) {
      completion.message = copy.completion.message;
    }
    if (Object.keys(completion).length > 0) out.completion = completion;
  }

  return Object.keys(out).length > 0 ? out : null;
}
