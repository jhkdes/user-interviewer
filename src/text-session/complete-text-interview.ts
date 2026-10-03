import type { InterviewMessage, TranscriptEntry } from "@/domain";
import { completeInterview } from "@/voice-session/call-lifecycle";
import type { TextSessionDeps } from "./types";

/** Builds the stored `TranscriptEntry[]` from the messages, with `timestampMs` measured from the interview's start — the same convention as voice transcripts. */
export function messagesToTranscript(
  messages: Pick<InterviewMessage, "speaker" | "text" | "createdAt">[],
  startedAt: Date,
): TranscriptEntry[] {
  return messages.map((message) => ({
    speaker: message.speaker,
    text: message.text,
    timestampMs: Math.max(0, message.createdAt.getTime() - startedAt.getTime()),
  }));
}

export interface CompleteTextInterviewInput {
  interviewId: string;
  /** e.g. `"time-cap"`, `"participant-requested"`, `"text-interview-ended"`, `"message-limit"`, `"participant-inactive"`. */
  endedReason: string;
  /** Names the caller (e.g. `"text-turn"`, `"idle-sweep"`) for the duplicate-completion warning. */
  source: string;
}

/**
 * Ends a text interview: builds the transcript from the stored messages,
 * completes the interview through the shared `completeInterview` (which runs
 * the summary, email, and completion webhook, and ignores a duplicate
 * completion), and — only if this call was the one that completed it —
 * deletes the raw messages so the transcript is the only copy.
 *
 * Returns whether this call completed the interview.
 */
export async function completeTextInterview(
  deps: TextSessionDeps,
  input: CompleteTextInterviewInput,
): Promise<boolean> {
  const interview = await deps.interviewRepo.getById(input.interviewId);
  if (!interview) throw new Error(`Interview not found: ${input.interviewId}`);

  const startedAt = interview.startedAt ?? interview.createdAt;
  const messages = await deps.messageRepo.listByInterviewId(input.interviewId);
  const now = deps.now ?? new Date();

  const completed = await completeInterview(deps, {
    interviewId: input.interviewId,
    transcript: messagesToTranscript(messages, startedAt),
    recordingUrl: null,
    endedReason: input.endedReason,
    completedAt: now,
    source: input.source,
  });
  if (!completed) return false;

  // The status flip above stops any further appends. If a message slipped in
  // between listing and flipping, keep it in the transcript before the raw
  // rows are deleted.
  try {
    const finalMessages = await deps.messageRepo.listByInterviewId(input.interviewId);
    if (finalMessages.length > messages.length) {
      await deps.interviewRepo.update(input.interviewId, {
        transcript: messagesToTranscript(finalMessages, startedAt),
      });
    }
    await deps.messageRepo.deleteByInterviewId(input.interviewId);
  } catch (error) {
    // Not fatal: the interview is completed and the transcript saved. The
    // leftover rows are only a raw copy; the idle sweep (phase 4) retries.
    console.error(`Failed to clean up messages of text interview ${input.interviewId}:`, error);
  }
  return true;
}
