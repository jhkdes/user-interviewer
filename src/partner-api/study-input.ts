import type { ParticipantCopy, Study } from "@/domain";
import { mergeLandingCopyPatch, parseLandingCopy } from "./landing-copy";
import { validateTemplate } from "./render-prompt";

/** The interview length used when a study sets none (the feedback defaults). */
export const DEFAULT_TARGET_MINUTES = 5;
export const DEFAULT_HARD_STOP_MINUTES = 7;
/** The voice agent ends any call at 30 minutes; leave room for the closing question. */
export const MAX_HARD_STOP_MINUTES = 25;
/** A dropped call with fewer participant turns than this shows "Your call ended early". */
export const DEFAULT_ENDED_EARLY_MIN_TURNS = 4;
export const MAX_LINE_LENGTH = 300;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isInt = (value: unknown): value is number => Number.isInteger(value);

export interface ParsedCreate {
  ownerRef: string;
  title: string;
  subjectName: string;
  interviewPrompt: string;
  firstMessage: string | null;
  closingQuestion: string | null;
  targetMinutes: number;
  hardStopMinutes: number;
  endedEarlyMinTurns: number;
  participantSummaryEmail: boolean;
  participantCopy: ParticipantCopy | null;
}

export type CreateParse =
  | { ok: true; value: ParsedCreate }
  | { ok: false; kind: "invalid" | "unsupported_provider"; errors: string[] };

const CREATE_KEYS = [
  "ownerRef",
  "title",
  "subjectName",
  "voiceProvider",
  "interviewPrompt",
  "firstMessage",
  "closingQuestion",
  "timing",
  "endedEarlyMinTurns",
  "participantSummaryEmail",
  "landingCopy",
];

/** A required piece of text, trimmed, within a length. */
function text(
  body: Record<string, unknown>,
  key: string,
  max: number,
  errors: string[],
): string | undefined {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${key} is required and must be text`);
    return undefined;
  }
  if (value.trim().length > max) {
    errors.push(`${key} is longer than ${max} characters`);
    return undefined;
  }
  return value.trim();
}

/** An optional line (opening line, closing question): text, or null/absent for the standard wording. */
function line(value: unknown, key: string, errors: string[]): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    errors.push(`${key} must be text`);
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_LINE_LENGTH) {
    errors.push(`${key} is longer than ${MAX_LINE_LENGTH} characters`);
    return undefined;
  }
  errors.push(...validateTemplate(trimmed, key));
  return trimmed || null;
}

/** Checks target/hard-stop minutes together: whole numbers, target below hard stop, hard stop within the limit. */
export function checkTiming(targetMinutes: unknown, hardStopMinutes: unknown): string[] {
  const errors: string[] = [];
  if (!isInt(targetMinutes) || targetMinutes < 1) {
    errors.push("timing.targetMinutes must be a whole number of at least 1");
  }
  if (!isInt(hardStopMinutes) || hardStopMinutes < 1) {
    errors.push("timing.hardStopMinutes must be a whole number of at least 1");
  } else if (hardStopMinutes > MAX_HARD_STOP_MINUTES) {
    errors.push(`timing.hardStopMinutes must be at most ${MAX_HARD_STOP_MINUTES}`);
  }
  if (errors.length === 0 && (targetMinutes as number) >= (hardStopMinutes as number)) {
    errors.push("timing.targetMinutes must be less than timing.hardStopMinutes");
  }
  return errors;
}

function checkEndedEarly(value: unknown): string | null {
  return isInt(value) && value >= 1 && value <= 50
    ? null
    : "endedEarlyMinTurns must be a whole number from 1 to 50";
}

/** Reads a timing object, filling the defaults for whatever it leaves out. */
function readTiming(
  raw: unknown,
  base: { targetMinutes: number; hardStopMinutes: number },
  errors: string[],
): { targetMinutes: number; hardStopMinutes: number } {
  if (raw === undefined) return base;
  if (!isObject(raw)) {
    errors.push("timing must be an object");
    return base;
  }
  const unknown = Object.keys(raw).filter((k) => k !== "targetMinutes" && k !== "hardStopMinutes");
  for (const key of unknown) errors.push(`timing: unknown field "${key}"`);
  const next = {
    targetMinutes:
      raw.targetMinutes === undefined ? base.targetMinutes : (raw.targetMinutes as number),
    hardStopMinutes:
      raw.hardStopMinutes === undefined ? base.hardStopMinutes : (raw.hardStopMinutes as number),
  };
  errors.push(...checkTiming(next.targetMinutes, next.hardStopMinutes));
  return next;
}

/** Validates the body of `POST /studies`. */
export function parseCreateStudy(body: unknown): CreateParse {
  if (!isObject(body))
    return { ok: false, kind: "invalid", errors: ["Request body must be a JSON object"] };

  const errors: string[] = [];
  for (const key of Object.keys(body)) {
    if (!CREATE_KEYS.includes(key)) errors.push(`unknown field "${key}"`);
  }

  const ownerRef = text(body, "ownerRef", 200, errors);
  const title = text(body, "title", 200, errors);
  const subjectName = text(body, "subjectName", 200, errors);

  // Only ElevenLabs in v1. Say so plainly rather than as a generic validation error.
  const provider = body.voiceProvider ?? "elevenlabs";
  if (provider === "vapi") {
    return {
      ok: false,
      kind: "unsupported_provider",
      errors: ['voiceProvider "vapi" is not supported; use "elevenlabs"'],
    };
  }
  if (provider !== "elevenlabs") errors.push('voiceProvider must be "elevenlabs"');

  const interviewPrompt = text(body, "interviewPrompt", 20_000, errors);
  if (interviewPrompt) errors.push(...validateTemplate(interviewPrompt, "interviewPrompt"));

  const firstMessage = line(body.firstMessage, "firstMessage", errors);
  const closingQuestion = line(body.closingQuestion, "closingQuestion", errors);

  const timing = readTiming(
    body.timing,
    { targetMinutes: DEFAULT_TARGET_MINUTES, hardStopMinutes: DEFAULT_HARD_STOP_MINUTES },
    errors,
  );

  let endedEarlyMinTurns = DEFAULT_ENDED_EARLY_MIN_TURNS;
  if (body.endedEarlyMinTurns !== undefined) {
    const problem = checkEndedEarly(body.endedEarlyMinTurns);
    if (problem) errors.push(problem);
    else endedEarlyMinTurns = body.endedEarlyMinTurns as number;
  }

  let participantSummaryEmail = false;
  if (body.participantSummaryEmail !== undefined) {
    if (typeof body.participantSummaryEmail !== "boolean") {
      errors.push("participantSummaryEmail must be true or false");
    } else participantSummaryEmail = body.participantSummaryEmail;
  }

  const landing = parseLandingCopy(body.landingCopy);
  if (!landing.ok) errors.push(...landing.errors);

  if (errors.length > 0 || !ownerRef || !title || !subjectName || !interviewPrompt || !landing.ok) {
    return { ok: false, kind: "invalid", errors };
  }
  return {
    ok: true,
    value: {
      ownerRef,
      title,
      subjectName,
      interviewPrompt,
      firstMessage: firstMessage ?? null,
      closingQuestion: closingQuestion ?? null,
      targetMinutes: timing.targetMinutes,
      hardStopMinutes: timing.hardStopMinutes,
      endedEarlyMinTurns,
      participantSummaryEmail,
      participantCopy: landing.value,
    },
  };
}

export interface ParsedPatch {
  title?: string;
  customPrompt?: string;
  firstMessage?: string | null;
  closingQuestion?: string | null;
  targetMinutes?: number;
  hardStopMinutes?: number;
  endedEarlyMinTurns?: number;
  participantSummaryEmail?: boolean;
  participantCopy?: ParticipantCopy | null;
}

export type PatchParse =
  { ok: true; value: ParsedPatch } | { ok: false; kind: "invalid" | "conflict"; errors: string[] };

const PATCHABLE_KEYS = [
  "title",
  "interviewPrompt",
  "firstMessage",
  "closingQuestion",
  "timing",
  "endedEarlyMinTurns",
  "participantSummaryEmail",
  "landingCopy",
];
/** Fixed at creation: sending the value it already has is harmless, sending a different one is a conflict. */
const FIXED_KEYS = ["voiceProvider", "ownerRef", "subjectName"];

/** Validates the body of `PATCH /studies/{id}` against the study it changes. */
export function parsePatchStudy(body: unknown, current: Study): PatchParse {
  if (!isObject(body))
    return { ok: false, kind: "invalid", errors: ["Request body must be a JSON object"] };

  const currentFixed: Record<string, unknown> = {
    voiceProvider: current.voiceProvider,
    ownerRef: current.ownerRef,
    subjectName: current.subjectName,
  };
  const conflicts = FIXED_KEYS.filter((key) => key in body && body[key] !== currentFixed[key]);
  if (conflicts.length > 0) {
    return {
      ok: false,
      kind: "conflict",
      errors: conflicts.map((key) => `${key} cannot be changed after the study is created`),
    };
  }

  const errors: string[] = [];
  for (const key of Object.keys(body)) {
    if (!PATCHABLE_KEYS.includes(key) && !FIXED_KEYS.includes(key)) {
      errors.push(`unknown field "${key}"`);
    }
  }

  const patch: ParsedPatch = {};

  if ("title" in body) {
    const title = text(body, "title", 200, errors);
    if (title) patch.title = title;
  }
  if ("interviewPrompt" in body) {
    const prompt = text(body, "interviewPrompt", 20_000, errors);
    if (prompt) {
      errors.push(...validateTemplate(prompt, "interviewPrompt"));
      patch.customPrompt = prompt;
    }
  }
  if ("firstMessage" in body) {
    const value = line(body.firstMessage, "firstMessage", errors);
    if (value !== undefined) patch.firstMessage = value;
  }
  if ("closingQuestion" in body) {
    const value = line(body.closingQuestion, "closingQuestion", errors);
    if (value !== undefined) patch.closingQuestion = value;
  }
  if ("timing" in body) {
    const timing = readTiming(
      body.timing,
      {
        targetMinutes: current.targetMinutes ?? DEFAULT_TARGET_MINUTES,
        hardStopMinutes: current.hardStopMinutes ?? DEFAULT_HARD_STOP_MINUTES,
      },
      errors,
    );
    patch.targetMinutes = timing.targetMinutes;
    patch.hardStopMinutes = timing.hardStopMinutes;
  }
  if ("endedEarlyMinTurns" in body) {
    const problem = checkEndedEarly(body.endedEarlyMinTurns);
    if (problem) errors.push(problem);
    else patch.endedEarlyMinTurns = body.endedEarlyMinTurns as number;
  }
  if ("participantSummaryEmail" in body) {
    if (typeof body.participantSummaryEmail !== "boolean") {
      errors.push("participantSummaryEmail must be true or false");
    } else patch.participantSummaryEmail = body.participantSummaryEmail;
  }
  if ("landingCopy" in body) {
    const merged = mergeLandingCopyPatch(current.participantCopy, body.landingCopy);
    if (!merged.ok) errors.push(...merged.errors);
    else patch.participantCopy = merged.value;
  }

  if (errors.length > 0) return { ok: false, kind: "invalid", errors };
  return { ok: true, value: patch };
}

export interface ParsedInvitation {
  trackingId: string;
  colleagueFirstName: string;
  context: Record<string, string>;
}

export type InvitationParse =
  | { ok: true; value: ParsedInvitation }
  | { ok: false; kind: "invalid" | "invalid_tracking_id"; errors: string[] };

/** 22-128 URL-safe characters: long enough that it cannot be guessed. */
export const TRACKING_ID_PATTERN = /^[A-Za-z0-9_-]{22,128}$/;
const CONTEXT_KEY = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const MAX_CONTEXT_KEYS = 20;
/** Longer is accepted and cut short when it is put in the prompt (see render-prompt.ts). */
const MAX_CONTEXT_INPUT_LENGTH = 5000;

/** Validates the body of `POST /studies/{id}/invitations`. */
export function parseInvitation(body: unknown): InvitationParse {
  if (!isObject(body))
    return { ok: false, kind: "invalid", errors: ["Request body must be a JSON object"] };

  const trackingId = body.trackingId;
  if (typeof trackingId !== "string" || !TRACKING_ID_PATTERN.test(trackingId)) {
    return {
      ok: false,
      kind: "invalid_tracking_id",
      errors: [
        "trackingId must be 22 to 128 characters from A-Z, a-z, 0-9, - and _, and unguessable (generate it from a cryptographically random source)",
      ],
    };
  }

  const errors: string[] = [];
  for (const key of Object.keys(body)) {
    if (!["trackingId", "colleagueFirstName", "context"].includes(key)) {
      errors.push(`unknown field "${key}"`);
    }
  }

  const colleagueFirstName = text(body, "colleagueFirstName", 100, errors);

  const context: Record<string, string> = {};
  if (body.context !== undefined) {
    if (!isObject(body.context)) errors.push("context must be an object of text values");
    else {
      const entries = Object.entries(body.context);
      if (entries.length > MAX_CONTEXT_KEYS) {
        errors.push(`context has more than ${MAX_CONTEXT_KEYS} fields`);
      }
      for (const [key, value] of entries) {
        if (!CONTEXT_KEY.test(key)) {
          errors.push(`context field name "${key}" must be letters, digits and underscores`);
        } else if (typeof value !== "string") {
          errors.push(`context.${key} must be text`);
        } else if (value.length > MAX_CONTEXT_INPUT_LENGTH) {
          errors.push(`context.${key} is longer than ${MAX_CONTEXT_INPUT_LENGTH} characters`);
        } else context[key] = value;
      }
    }
  }

  if (errors.length > 0 || !colleagueFirstName) return { ok: false, kind: "invalid", errors };
  return { ok: true, value: { trackingId, colleagueFirstName, context } };
}
