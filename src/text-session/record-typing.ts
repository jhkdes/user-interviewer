import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import { TYPING_SIGNAL_MIN_INTERVAL_MS } from "./constants";

export type RecordTypingResult =
  | { ok: true; recorded: boolean }
  | {
      ok: false;
      status: number;
      code: "interview-not-found" | "not-text-interview" | "interview-ended";
    };

export interface RecordTypingDeps {
  interviewRepo: InterviewRepository;
  studyRepo: StudyRepository;
  /** Defaults to `new Date()` — overridable for tests. */
  now?: Date;
}

/**
 * The participant is typing a reply: counts as activity, so the idle nudge
 * and the inactivity timeout wait for them. The browser sends this at most
 * once every ~20 seconds and never sends the text itself. Signals arriving
 * within a few seconds of the last activity are accepted but ignored, so a
 * misbehaving client can't turn this into a write per keystroke.
 */
export async function recordTyping(
  deps: RecordTypingDeps,
  interviewId: string,
): Promise<RecordTypingResult> {
  const now = deps.now ?? new Date();

  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview) return { ok: false, status: 404, code: "interview-not-found" };
  const study = await deps.studyRepo.getById(interview.studyId);
  if (!study || study.type !== "feedback" || interview.mode !== "text") {
    return { ok: false, status: 409, code: "not-text-interview" };
  }
  if (interview.status !== "in-progress") {
    return { ok: false, status: 409, code: "interview-ended" };
  }

  if (
    interview.lastActivityAt &&
    now.getTime() - interview.lastActivityAt.getTime() < TYPING_SIGNAL_MIN_INTERVAL_MS
  ) {
    return { ok: true, recorded: false };
  }

  await deps.interviewRepo.update(interviewId, { lastActivityAt: now });
  return { ok: true, recorded: true };
}
