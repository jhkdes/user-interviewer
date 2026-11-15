import type { InterviewStatus } from "@/domain";
import type { InterviewMessageRepository } from "@/repositories/interview-message-repository";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";

export interface TextStateMessage {
  seq: number;
  speaker: "interviewer" | "participant";
  text: string;
  createdAt: string;
}

/** What the participant's browser needs to draw (or resume) a text interview. */
export interface TextState {
  mode: "text";
  status: InterviewStatus;
  /** Why a completed interview ended (e.g. `"time-cap"`, `"participant-inactive"`); `null` while it is running. */
  endedReason: string | null;
  firstName: string;
  startedAt: string | null;
  /** The server's clock when this was read, so the chat's countdown doesn't depend on the participant's own clock being right. */
  serverTime: string;
  messages: TextStateMessage[];
}

export interface TextStateDeps {
  interviewRepo: InterviewRepository;
  studyRepo: StudyRepository;
  messageRepo: InterviewMessageRepository;
}

/**
 * Reads the state of a text interview for its participant. Returns `null`
 * when the interview doesn't exist, doesn't belong to the study behind
 * `linkToken`, isn't a text interview — one answer for
 * all of those, so the endpoint doesn't reveal which. While the interview is
 * running the messages come from `interview_messages`; once it has completed
 * they come from the stored transcript (the raw rows are deleted by then).
 */
export async function getTextState(
  deps: TextStateDeps,
  input: { interviewId: string; linkToken: string },
): Promise<TextState | null> {
  const interview = await deps.interviewRepo.getById(input.interviewId);
  if (!interview || interview.mode !== "text") return null;

  const study = await deps.studyRepo.getById(interview.studyId);
  if (!study) return null;
  // Typed interviews come in through a study's text link. A feedback
  // interview that was switched to typing from its voice link (an option the
  // voice link no longer offers) is still readable through that link.
  const isOwnLink =
    input.linkToken === study.textLinkToken ||
    (study.type === "feedback" && input.linkToken === study.linkToken);
  if (!isOwnLink) return null;

  const base = {
    mode: "text" as const,
    status: interview.status,
    endedReason: interview.endedReason,
    firstName: interview.firstName,
    startedAt: interview.startedAt ? interview.startedAt.toISOString() : null,
    serverTime: new Date().toISOString(),
  };

  if (interview.status === "completed" && interview.transcript) {
    const startedAt = interview.startedAt ?? interview.createdAt;
    return {
      ...base,
      messages: interview.transcript.map((entry, index) => ({
        seq: index + 1,
        speaker: entry.speaker,
        text: entry.text,
        createdAt: new Date(startedAt.getTime() + entry.timestampMs).toISOString(),
      })),
    };
  }

  const messages = await deps.messageRepo.listByInterviewId(interview.id);
  return {
    ...base,
    messages: messages.map((message) => ({
      seq: message.seq,
      speaker: message.speaker,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}
