import type { TextTurnEvent } from "@/text-session/types";
import type { TextState } from "@/text-session/text-state";

export interface TextTurnRequest {
  /** Reused when retrying the same message so a retry never creates a second copy. */
  clientMessageId: string;
  /** Omit for the opening greeting, or to regenerate a reply that never arrived. */
  message?: string;
  /** The previous attempt at this turn is known to have failed — regenerate now. */
  retry?: boolean;
}

export type TextTurnOutcome =
  | {
      kind: "done";
      message: { seq: number; text: string };
      interviewOver: boolean;
      endedReason: string | null;
    }
  /** The server refused the request before replying (HTTP error). Nothing was written unless the code says otherwise. */
  | {
      kind: "rejected";
      status: number;
      code: string;
      message: string;
      endedReason: string | null;
    }
  /** The reply started but failed or was dropped (`generation-failed`, `conflict`). */
  | { kind: "stream-error"; code: "generation-failed" | "conflict"; message: string }
  /** The network failed, or the stream ended without a `done`/`error` event. The server may still have saved a reply. */
  | { kind: "connection-lost" };

/**
 * Posts one turn to the text-interview endpoint and reads its
 * newline-delimited JSON stream, calling `onDelta` for every piece of the
 * interviewer's reply as it arrives.
 */
export async function sendTextTurn(
  interviewId: string,
  request: TextTurnRequest,
  onDelta: (text: string) => void,
): Promise<TextTurnOutcome> {
  let response: Response;
  try {
    response = await fetch(`/api/interviews/${interviewId}/text-turn`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    return { kind: "connection-lost" };
  }

  if (!response.ok) {
    let error: { code?: string; message?: string; endedReason?: string | null } = {};
    try {
      error = ((await response.json()) as { error?: typeof error }).error ?? {};
    } catch {
      // Non-JSON error body — fall through with defaults.
    }
    return {
      kind: "rejected",
      status: response.status,
      code: error.code ?? "server-error",
      message: error.message ?? "Something went wrong. Please try again.",
      endedReason: error.endedReason ?? null,
    };
  }

  if (!response.body) return { kind: "connection-lost" };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: TextTurnOutcome | null = null;

  const handleLine = (line: string) => {
    if (line.trim() === "") return;
    let event: TextTurnEvent;
    try {
      event = JSON.parse(line) as TextTurnEvent;
    } catch {
      return;
    }
    if (event.type === "text-delta") {
      onDelta(event.text);
    } else if (event.type === "done") {
      outcome = {
        kind: "done",
        message: event.message,
        interviewOver: event.interviewOver,
        endedReason: event.endedReason,
      };
    } else if (event.type === "error") {
      outcome = { kind: "stream-error", code: event.code, message: event.message };
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        handleLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    handleLine(buffer);
  } catch {
    return outcome ?? { kind: "connection-lost" };
  }

  return outcome ?? { kind: "connection-lost" };
}

/** Fire-and-forget: tells the server the participant is typing, so the idle nudge and timeout wait for them. Carries no text; failures are ignored. */
export function reportTyping(interviewId: string): void {
  fetch(`/api/interviews/${interviewId}/typing`, { method: "POST", keepalive: true }).catch(
    () => {},
  );
}

export type TextStateResult =
  { kind: "ok"; state: TextState } | { kind: "not-found" } | { kind: "error" };

/** Reads the interview's current state (status and messages), for resuming and for recovering after a dropped connection. */
export async function fetchTextState(
  interviewId: string,
  linkToken: string,
): Promise<TextStateResult> {
  try {
    const response = await fetch(
      `/api/interviews/${interviewId}/text-state?linkToken=${encodeURIComponent(linkToken)}`,
      { cache: "no-store" },
    );
    if (response.status === 404) return { kind: "not-found" };
    if (!response.ok) return { kind: "error" };
    return { kind: "ok", state: (await response.json()) as TextState };
  } catch {
    return { kind: "error" };
  }
}
