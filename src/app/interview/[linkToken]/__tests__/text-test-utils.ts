import type { TextState } from "@/text-session/text-state";
import type { TextTurnEvent } from "@/text-session/types";

/** A streamed NDJSON response like the text-turn endpoint's, optionally split into awkward chunks. */
export function ndjsonResponse(events: TextTurnEvent[], options: { splitEvery?: number } = {}) {
  const encoder = new TextEncoder();
  const text = events.map((event) => `${JSON.stringify(event)}\n`).join("");
  const bytes = encoder.encode(text);
  const size = options.splitEvery ?? bytes.length;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) {
        controller.enqueue(bytes.slice(i, i + size));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function turnError(status: number, code: string, message: string, endedReason?: string) {
  return jsonResponse(
    { error: { code, message, ...(endedReason !== undefined ? { endedReason } : {}) } },
    status,
  );
}

export function doneEvent(
  seq: number,
  text: string,
  over = false,
  endedReason: string | null = null,
) {
  return {
    type: "done" as const,
    message: { seq, text },
    interviewOver: over,
    endedReason,
  };
}

export function makeState(overrides: Partial<TextState> = {}): TextState {
  return {
    mode: "text",
    status: "in-progress",
    endedReason: null,
    firstName: "Sam",
    startedAt: "2026-01-01T00:00:00.000Z",
    messages: [],
    ...overrides,
  };
}

export function stateMessages(...texts: [speaker: "interviewer" | "participant", text: string][]) {
  return texts.map(([speaker, text], index) => ({
    seq: index + 1,
    speaker,
    text,
    createdAt: "2026-01-01T00:00:00.000Z",
  }));
}
