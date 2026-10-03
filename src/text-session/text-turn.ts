import type { Interview, InterviewMessage, Study } from "@/domain";
import { startInterview } from "@/voice-session/call-lifecycle";
import { generateTurnStreaming, type GenerateTurnStreamEvent } from "@/voice-session/generate-turn";
import { completeTextInterview } from "./complete-text-interview";
import { countCharacters } from "./count-characters";
import {
  isIdleNudge,
  MAX_CLIENT_MESSAGE_ID_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_PARTICIPANT_MESSAGES,
  MAX_PARTICIPANT_MESSAGES_PER_MINUTE,
  MIN_MS_BETWEEN_PARTICIPANT_MESSAGES,
  STALE_REPLY_MS,
} from "./constants";
import { messagesToOpenAI } from "./messages-to-openai";
import type {
  TextSessionDeps,
  TextTurnErrorCode,
  TextTurnEvent,
  TextTurnFailure,
  TextTurnStart,
} from "./types";

export interface TextTurnInput {
  interviewId: string;
  /** Client-generated id, reused when retrying the same message so a retry never creates a second copy. */
  clientMessageId: string;
  /** The participant's message. Omit to ask for the next interviewer message without sending one: the opening greeting, or regenerating a reply that failed. */
  message?: string;
  /**
   * Set by a client that knows its previous attempt at this turn failed (the
   * stream reported `generation-failed`, or the connection dropped and the
   * state shows no reply): regenerate the missing reply now instead of
   * waiting out STALE_REPLY_MS. Wasted work at worst — if the first attempt
   * is somehow still running, the second reply fails to append and is dropped.
   */
  retry?: boolean;
}

function fail(
  status: number,
  code: TextTurnErrorCode,
  message: string,
  extra: Partial<Pick<TextTurnFailure, "endedReason">> = {},
): TextTurnFailure {
  return { ok: false, status, code, message, ...extra };
}

const STILL_REPLYING = fail(
  409,
  "still-replying",
  "The interviewer is still replying. Please wait a moment.",
);

export { countCharacters };

/** The `endedReason` recorded when the agent ends the interview. */
function endedReasonFor(terminationReason: string | null): string {
  if (terminationReason === "time-cap") return "time-cap";
  if (terminationReason === "participant-requested") return "participant-requested";
  return "text-interview-ended";
}

async function* singleEvent(event: TextTurnEvent): AsyncGenerator<TextTurnEvent, void, unknown> {
  yield event;
}

interface ReplyContext {
  interview: Interview;
  study: Study;
  /** The conversation so far, including the participant message this reply answers (if any). */
  history: InterviewMessage[];
}

/**
 * Generates and stores the interviewer's next message, streaming it as it is
 * written. The model call, the append, and (when the agent ends the
 * interview) the completion all happen here, after the HTTP response has
 * started — the caller must keep consuming this even if the browser
 * disconnects, so the reply is still saved.
 */
async function* generateReply(
  deps: TextSessionDeps,
  context: ReplyContext,
): AsyncGenerator<TextTurnEvent, void, unknown> {
  const { interview, study, history } = context;
  const afterSeq = history.length === 0 ? 0 : history[history.length - 1].seq;

  let final: Extract<GenerateTurnStreamEvent, { type: "done" }>;
  try {
    let done: typeof final | undefined;
    for await (const event of generateTurnStreaming(deps, {
      interviewId: interview.id,
      // The scripted idle nudge is for the participant only: leaving it out
      // keeps the model's view (and the agent's "was the open-floor question
      // the last thing the interviewer said?" check) as if it never happened.
      messages: messagesToOpenAI(history.filter((message) => !isIdleNudge(message))),
      preloaded: { interview, study },
    })) {
      if (event.type === "text-delta") {
        yield { type: "text-delta", text: event.text };
      } else {
        done = event;
      }
    }
    if (!done) throw new Error("turn generation ended without a result");
    final = done;
  } catch (error) {
    console.error(`Failed to generate the next text-interview turn for ${interview.id}:`, error);
    yield {
      type: "error",
      code: "generation-failed",
      message: "Something went wrong on our side. Please try again.",
    };
    return;
  }

  const utterance = final.utterance.trim();
  if (utterance === "") {
    console.error(`Text-interview turn for ${interview.id} produced an empty reply`);
    yield {
      type: "error",
      code: "generation-failed",
      message: "Something went wrong on our side. Please try again.",
    };
    return;
  }

  const appended = await deps.messageRepo.append({
    interviewId: interview.id,
    speaker: "interviewer",
    text: utterance,
    afterSeq,
  });
  if (appended.outcome !== "appended") {
    // Another writer (a retry, a second tab, or the interview ending) got
    // there first; their message stands and ours is dropped.
    yield {
      type: "error",
      code: "conflict",
      message: "The conversation changed while the interviewer was replying. Please refresh.",
    };
    return;
  }

  await deps.interviewRepo.update(interview.id, { lastActivityAt: deps.now ?? new Date() });

  let endedReason: string | null = null;
  if (final.isInterviewOver) {
    endedReason = endedReasonFor(final.terminationReason);
    try {
      await completeTextInterview(deps, {
        interviewId: interview.id,
        endedReason,
        source: "text-turn",
      });
    } catch (error) {
      // The reply is saved and the participant should see the interview end.
      // If completion itself failed the interview stays in-progress and the
      // idle sweep (phase 4) finishes it.
      console.error(`Failed to complete text interview ${interview.id}:`, error);
    }
  }

  yield {
    type: "done",
    message: { seq: appended.message.seq, text: appended.message.text },
    interviewOver: final.isInterviewOver,
    endedReason,
  };
}

/**
 * Handles one request to the text-interview turn endpoint. Does all the
 * checking and the participant-message write up front and returns either a
 * failure (a plain HTTP error) or the event stream for the interviewer's
 * reply.
 *
 * Request shapes:
 *   - `message` present: the participant sends a message; the reply streams back.
 *   - `message` absent and no messages yet: the opening greeting. Starts the interview.
 *   - `message` absent and the last message is a participant message that never got a reply (older than STALE_REPLY_MS): regenerates that reply.
 *
 * Abuse limits (see TEXT_INTERVIEW_MODE.md): message length, one turn at a
 * time per interview, a per-interview rate limit, and a total message cap.
 */
export async function startTextTurn(
  deps: TextSessionDeps,
  input: TextTurnInput,
): Promise<TextTurnStart> {
  const now = deps.now ?? new Date();

  // 1. Validate the request itself before touching anything.
  const clientMessageId = input.clientMessageId;
  if (
    typeof clientMessageId !== "string" ||
    clientMessageId.trim() === "" ||
    clientMessageId.length > MAX_CLIENT_MESSAGE_ID_CHARS
  ) {
    return fail(400, "invalid-request", "The request is missing a valid message id.");
  }

  let text: string | undefined;
  if (input.message !== undefined) {
    if (typeof input.message !== "string") {
      return fail(400, "invalid-request", "The message must be text.");
    }
    text = input.message.trim();
    if (text === "") return fail(400, "invalid-request", "Please type a message before sending.");
    const length = countCharacters(text);
    if (length > MAX_MESSAGE_CHARS) {
      return fail(
        422,
        "message-too-long",
        `Your message is a bit long (${length} of ${MAX_MESSAGE_CHARS} characters). Please shorten it a little and send it again.`,
      );
    }
  }

  // 2. Load and check the interview.
  let interview = await deps.interviewRepo.getById(input.interviewId);
  if (!interview) return fail(404, "interview-not-found", "We couldn't find this interview.");
  const study = await deps.studyRepo.getById(interview.studyId);
  if (!study) return fail(404, "interview-not-found", "We couldn't find this interview.");
  if (study.type !== "feedback") {
    return fail(403, "not-supported", "Typing isn't available for this interview.");
  }
  if (interview.mode !== "text") {
    return fail(409, "not-text-interview", "This interview isn't a typing interview.");
  }
  if (interview.status === "completed" || interview.status === "expired") {
    return fail(409, "interview-ended", "This interview has ended.", {
      endedReason: interview.endedReason,
    });
  }

  const messages = await deps.messageRepo.listByInterviewId(interview.id);
  const last = messages.length === 0 ? undefined : messages[messages.length - 1];

  // 3a. No message sent: the opening greeting, or regenerating a failed reply.
  if (text === undefined) {
    if (!last) {
      if (interview.status === "pending") {
        await startInterview(deps, interview.id, now);
        // Reload so the agent measures the time cap from the real start.
        const started = await deps.interviewRepo.getById(interview.id);
        if (started) interview = started;
      }
      return { ok: true, events: generateReply(deps, { interview, study, history: [] }) };
    }
    if (last.speaker === "participant") {
      if (input.retry !== true && now.getTime() - last.createdAt.getTime() < STALE_REPLY_MS) {
        return STILL_REPLYING;
      }
      return { ok: true, events: generateReply(deps, { interview, study, history: messages }) };
    }
    return fail(409, "opening-already-done", "The interview has already started.");
  }

  // 3b. A retry of a message we already stored: answer with its reply.
  const existing = messages.find((message) => message.clientMessageId === clientMessageId);
  if (existing) {
    const reply = messages.find(
      (message) => message.seq === existing.seq + 1 && message.speaker === "interviewer",
    );
    if (reply) {
      return {
        ok: true,
        events: singleEvent({
          type: "done",
          message: { seq: reply.seq, text: reply.text },
          interviewOver: false,
          endedReason: null,
        }),
      };
    }
    if (input.retry !== true && now.getTime() - existing.createdAt.getTime() < STALE_REPLY_MS) {
      return STILL_REPLYING;
    }
    const history = messages.filter((message) => message.seq <= existing.seq);
    return { ok: true, events: generateReply(deps, { interview, study, history }) };
  }

  // 3c. A new participant message.
  if (interview.status === "pending") {
    return fail(409, "interview-not-started", "The interview hasn't started yet.");
  }
  if (last?.speaker === "participant") return STILL_REPLYING;

  const participantMessages = messages.filter((message) => message.speaker === "participant");
  if (participantMessages.length >= MAX_PARTICIPANT_MESSAGES) {
    await completeTextInterview(deps, {
      interviewId: interview.id,
      endedReason: "message-limit",
      source: "text-turn",
    });
    return fail(409, "interview-ended", "This interview has ended.", {
      endedReason: "message-limit",
    });
  }

  const lastParticipant = participantMessages[participantMessages.length - 1];
  const recentCount = participantMessages.filter(
    (message) => now.getTime() - message.createdAt.getTime() < 60_000,
  ).length;
  if (
    (lastParticipant &&
      now.getTime() - lastParticipant.createdAt.getTime() < MIN_MS_BETWEEN_PARTICIPANT_MESSAGES) ||
    recentCount >= MAX_PARTICIPANT_MESSAGES_PER_MINUTE
  ) {
    return fail(
      429,
      "rate-limited",
      "You're sending messages quite fast. Please wait a moment and try again.",
    );
  }

  const appended = await deps.messageRepo.append({
    interviewId: interview.id,
    speaker: "participant",
    text,
    clientMessageId,
    afterSeq: last?.seq ?? 0,
  });
  switch (appended.outcome) {
    case "appended":
      break;
    case "duplicate":
      // Same message id stored by a request that landed between our read and write.
      return STILL_REPLYING;
    case "conflict":
      return fail(
        409,
        "conflict",
        "The conversation changed while you were typing. Please refresh and try again.",
      );
    case "interview-not-found":
      return fail(404, "interview-not-found", "We couldn't find this interview.");
    case "interview-not-in-progress": {
      const current = await deps.interviewRepo.getById(interview.id);
      return fail(409, "interview-ended", "This interview has ended.", {
        endedReason: current?.endedReason ?? null,
      });
    }
  }

  // Typing a message is activity; clears any pending idle nudge (phase 4).
  await deps.interviewRepo.update(interview.id, { lastActivityAt: now, idleNudgeSentAt: null });

  return {
    ok: true,
    events: generateReply(deps, { interview, study, history: [...messages, appended.message] }),
  };
}
