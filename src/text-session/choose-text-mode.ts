import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";

export type ChooseTextModeResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: "interview-not-found" | "not-supported" | "interview-already-started";
      message: string;
    };

export interface ChooseTextModeDeps {
  interviewRepo: InterviewRepository;
  studyRepo: StudyRepository;
  /** Whether text mode is switched on for this deploy — see `isTextInterviewModeEnabled`. */
  enabled: boolean;
}

/**
 * The participant chose to type instead of waiting for the voice call: marks
 * their not-yet-started interview as a text interview. Idempotent (choosing
 * text twice is fine). Only feedback studies, only while the interview is
 * still `pending` — restarting a voice call that already began is a separate
 * flow (see TEXT_INTERVIEW_MODE.md, phase 6).
 */
export async function chooseTextMode(
  deps: ChooseTextModeDeps,
  interviewId: string,
): Promise<ChooseTextModeResult> {
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
  if (interview.status !== "pending") {
    return {
      ok: false,
      status: 409,
      code: "interview-already-started",
      message: "This interview has already started.",
    };
  }

  if (interview.mode !== "text") {
    await deps.interviewRepo.update(interviewId, { mode: "text" });
  }
  return { ok: true };
}
