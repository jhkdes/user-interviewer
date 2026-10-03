import type { InterviewMessage } from "@/domain";
import type { CallLifecycleDeps } from "@/voice-session/call-lifecycle";
import type { GenerateTurnDeps } from "@/voice-session/generate-turn";
import type { InterviewMessageRepository } from "@/repositories/interview-message-repository";

/** Everything the text-interview flow needs: turn generation, completion side effects, and message storage. */
export type TextSessionDeps = GenerateTurnDeps &
  CallLifecycleDeps & { messageRepo: InterviewMessageRepository };

export type TextTurnErrorCode =
  | "invalid-request"
  | "message-too-long"
  | "interview-not-found"
  | "not-supported"
  | "not-text-interview"
  | "interview-not-started"
  | "interview-ended"
  | "opening-already-done"
  | "still-replying"
  | "conflict"
  | "rate-limited";

/** A request rejected before any reply was generated — maps to an HTTP error response. Nothing was written unless the code says otherwise. */
export interface TextTurnFailure {
  ok: false;
  status: number;
  code: TextTurnErrorCode;
  /** Participant-safe wording the client can show as is. */
  message: string;
  /** For `interview-ended`: why it ended (e.g. `"time-cap"`, `"participant-inactive"`, `"message-limit"`), so the client can show the right end screen. */
  endedReason?: string | null;
}

/** Events streamed to the browser as one JSON object per line. */
export type TextTurnEvent =
  | { type: "text-delta"; text: string }
  | {
      type: "done";
      /** The stored interviewer message. */
      message: Pick<InterviewMessage, "seq" | "text">;
      /** True when this reply ended the interview. */
      interviewOver: boolean;
      endedReason: string | null;
    }
  | { type: "error"; code: "generation-failed" | "conflict"; message: string };

export type TextTurnStart =
  TextTurnFailure | { ok: true; events: AsyncGenerator<TextTurnEvent, void, unknown> };
