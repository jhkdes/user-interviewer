import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import { SWITCH_TO_TEXT_GRACE_MS, SWITCH_TO_TEXT_WINDOW_MS } from "./constants";

export type SwitchToTextResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code:
        "interview-not-found" | "not-supported" | "interview-ended" | "already-typing" | "too-late";
      message: string;
    };

export interface SwitchToTextDeps {
  interviewRepo: InterviewRepository;
  studyRepo: StudyRepository;
  /** Whether text mode is switched on for this deploy — see `isTextInterviewModeEnabled`. */
  enabled: boolean;
  /** Defaults to `new Date()` — overridable for tests. */
  now?: Date;
}

/**
 * The participant couldn't use voice and chose "restart with a typing
 * interview", either shortly after the voice call began or from the
 * microphone-error screen. Discards the voice attempt and resets the
 * interview to a fresh, pending, text-mode one, so the chat starts from a new
 * greeting. See TEXT_INTERVIEW_MODE.md.
 *
 * Order matters and is the caller's responsibility: this must succeed
 * *before* the browser stops the voice call, because stopping the call makes
 * the provider send its end-of-call webhook — which the webhook handlers
 * ignore only once the interview is already marked as a typing interview.
 *
 * Only feedback studies. Refuses once the call has run past the window, so a
 * participant can't throw away a real interview by accident (the window is
 * enforced against `startedAt`, which only Vapi reports during a call;
 * ElevenLabs reports the start time only after the call, so there the 30
 * seconds are enforced by the browser alone).
 */
export async function switchToText(
  deps: SwitchToTextDeps,
  interviewId: string,
): Promise<SwitchToTextResult> {
  const now = deps.now ?? new Date();
  const notFound = {
    ok: false,
    status: 404,
    code: "interview-not-found",
    message: "We couldn't find this interview.",
  } as const;

  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview) return notFound;
  const study = await deps.studyRepo.getById(interview.studyId);
  if (!study) return notFound;

  if (!deps.enabled || study.type !== "feedback") {
    return {
      ok: false,
      status: 403,
      code: "not-supported",
      message: "Typing isn't available for this interview.",
    };
  }

  if (interview.status === "completed" || interview.status === "expired") {
    return {
      ok: false,
      status: 409,
      code: "interview-ended",
      message: "This interview has already ended.",
    };
  }

  if (interview.mode === "text") {
    // A repeat of a switch that already went through (a retry after a dropped
    // response) is fine. A chat that has already begun must never be reset.
    if (interview.status === "pending") return { ok: true };
    return {
      ok: false,
      status: 409,
      code: "already-typing",
      message: "This interview is already a typing interview.",
    };
  }

  if (
    interview.startedAt &&
    now.getTime() - interview.startedAt.getTime() >
      SWITCH_TO_TEXT_WINDOW_MS + SWITCH_TO_TEXT_GRACE_MS
  ) {
    return {
      ok: false,
      status: 409,
      code: "too-late",
      message: "It's too late to restart this interview as a typing interview.",
    };
  }

  // One conditional update: if the call's own end-of-call webhook completed
  // the interview since we looked, that wins and nothing is reset.
  const reset = await deps.interviewRepo.updateIfNotCompleted(interviewId, {
    mode: "text",
    switchedToTextAt: now,
    status: "pending",
    startedAt: null,
    transcript: null,
    endedReason: null,
    // Everything the discarded call may have set.
    vapiCallId: null,
    elevenLabsConversationId: null,
    recordingUrl: null,
    backgroundedAt: null,
    timeCheckAskedAt: null,
    extensionGranted: null,
    secondTimeCheckAskedAt: null,
    openFloorAskedAt: null,
    lastActivityAt: null,
    idleNudgeSentAt: null,
  });
  if (!reset) {
    return {
      ok: false,
      status: 409,
      code: "interview-ended",
      message: "This interview has already ended.",
    };
  }
  return { ok: true };
}
