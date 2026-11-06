import type { ParticipantCopy } from "@/domain";
import { validateParticipantCopy } from "@/participant-copy";

/**
 * The partner API's `landingCopy`: a flat object of the colleague-facing
 * landing and ending text. It maps onto the same `ParticipantCopy` the
 * dashboard editor saves, so an API-set value and an editor-set value are one
 * and the same thing (see src/participant-copy for limits and meaning).
 */
export interface LandingCopy {
  brandLabel?: string;
  tagline?: string;
  facts?: string[];
  steps?: { title: string; body: string }[];
  consentNote?: string;
  endingTitle?: string;
  endingMessage?: string;
  contactEmail?: string;
  showFaq?: boolean;
}

export const LANDING_COPY_KEYS = [
  "brandLabel",
  "tagline",
  "facts",
  "steps",
  "consentNote",
  "endingTitle",
  "endingMessage",
  "contactEmail",
  "showFaq",
] as const satisfies readonly (keyof LandingCopy)[];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type LandingParse =
  { ok: true; value: ParticipantCopy | null } | { ok: false; errors: string[] };

/** Checks an incoming `landingCopy` and turns it into the stored copy. `null` or `{}` means "use the standard wording". */
export function parseLandingCopy(raw: unknown): LandingParse {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (!isObject(raw)) return { ok: false, errors: ["landingCopy must be an object"] };

  const unknown = Object.keys(raw).filter(
    (key) => !(LANDING_COPY_KEYS as readonly string[]).includes(key),
  );
  if (unknown.length > 0) {
    return { ok: false, errors: unknown.map((key) => `landingCopy: unknown field "${key}"`) };
  }

  const result = validateParticipantCopy({
    intro: {
      brandLabel: raw.brandLabel,
      tagline: raw.tagline,
      facts: raw.facts,
      steps: raw.steps,
      consentNote: raw.consentNote,
      contactEmail: raw.contactEmail,
      showFaq: raw.showFaq,
    },
    completion: { title: raw.endingTitle, message: raw.endingMessage },
  });
  if (!result.valid) return { ok: false, errors: result.errors.map((e) => `landingCopy: ${e}`) };
  return { ok: true, value: result.value };
}

/** The stored copy as the API shows it: only the fields that are set. */
export function toLandingCopy(copy: ParticipantCopy | null): LandingCopy {
  const out: LandingCopy = {};
  const intro = copy?.intro;
  if (intro?.brandLabel) out.brandLabel = intro.brandLabel;
  if (intro?.tagline) out.tagline = intro.tagline;
  if (intro?.facts?.length) out.facts = intro.facts;
  if (intro?.steps?.length) out.steps = intro.steps;
  if (intro?.consentNote) out.consentNote = intro.consentNote;
  if (copy?.completion?.title) out.endingTitle = copy.completion.title;
  if (copy?.completion?.message) out.endingMessage = copy.completion.message;
  if (intro?.contactEmail) out.contactEmail = intro.contactEmail;
  if (intro?.showFaq) out.showFaq = true;
  return out;
}

/**
 * Applies a `PATCH` of `landingCopy` to what is stored. Each field in the patch
 * replaces that field; a field set to `null` goes back to the standard
 * wording; fields not mentioned are left alone. `landingCopy: null` clears all.
 */
export function mergeLandingCopyPatch(
  current: ParticipantCopy | null,
  patch: unknown,
): LandingParse {
  if (patch === null) return { ok: true, value: null };
  if (!isObject(patch)) return { ok: false, errors: ["landingCopy must be an object or null"] };

  const merged: Record<string, unknown> = { ...toLandingCopy(current) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return parseLandingCopy(merged);
}
