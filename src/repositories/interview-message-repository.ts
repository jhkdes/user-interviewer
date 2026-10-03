import type { InterviewMessage } from "@/domain";

export interface AppendInterviewMessageInput {
  interviewId: string;
  speaker: InterviewMessage["speaker"];
  text: string;
  /** Client-generated id making a retried participant message idempotent. Omit for interviewer messages. */
  clientMessageId?: string;
  /**
   * Optimistic concurrency: when set, the append only succeeds if the
   * interview's current last `seq` equals this value (`0` for an interview
   * with no messages yet). Omit to append after whatever is there.
   */
  afterSeq?: number;
}

export type AppendInterviewMessageResult =
  /** The message was stored with `seq` = previous last seq + 1. */
  | { outcome: "appended"; message: InterviewMessage }
  /** A message with the same `clientMessageId` was already stored — nothing new was written; `message` is the stored one. */
  | { outcome: "duplicate"; message: InterviewMessage }
  /** Another writer got there first (`afterSeq` didn't match, or the `seq` slot was claimed concurrently). Nothing was written. */
  | { outcome: "conflict" }
  /** The interview is `pending`, `completed`, or `expired`. Messages can only be added while it is `in-progress`. */
  | { outcome: "interview-not-in-progress" }
  | { outcome: "interview-not-found" };

/**
 * Storage for the messages of an in-progress text interview (see
 * TEXT_INTERVIEW_MODE.md). Append-only while the interview runs; once the
 * transcript has been written into `Interview.transcript`, the rows are
 * deleted with `deleteByInterviewId`.
 */
export interface InterviewMessageRepository {
  /** Atomically appends one message — see `AppendInterviewMessageResult` for the outcomes. */
  append(input: AppendInterviewMessageInput): Promise<AppendInterviewMessageResult>;
  /** All messages of the interview, ordered by `seq`. Empty for an unknown interview. */
  listByInterviewId(interviewId: string): Promise<InterviewMessage[]>;
  /** Ids of interviews that still have stored messages, at most `limit` of them — lets the idle sweep find completed interviews whose raw messages failed to delete. */
  listInterviewIdsWithMessages(limit: number): Promise<string[]>;
  /** Removes every message of the interview. A no-op when there are none. */
  deleteByInterviewId(interviewId: string): Promise<void>;
}
