import { NextResponse } from "next/server";
import { MAX_REQUEST_BODY_BYTES, startTextTurn } from "@/text-session";
import { getTextSessionDeps } from "@/text-session/get-text-session-deps";

export const dynamic = "force-dynamic";

/**
 * Text-interview turn: the participant sends a message (or asks for the
 * opening greeting) and the interviewer's reply streams back as
 * newline-delimited JSON events (`text-delta`, then `done`, or `error`).
 * Only feedback-study interviews in text mode are accepted — everything else
 * is rejected before any reply is generated. See TEXT_INTERVIEW_MODE.md.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  // Reject oversized bodies before reading them: a declared length first,
  // then the actual text (the header can be absent or wrong).
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_REQUEST_BODY_BYTES) {
    return NextResponse.json(
      { error: { code: "invalid-request", message: "That message is too large to send." } },
      { status: 413 },
    );
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_REQUEST_BODY_BYTES) {
    return NextResponse.json(
      { error: { code: "invalid-request", message: "That message is too large to send." } },
      { status: 413 },
    );
  }

  let body: { clientMessageId?: unknown; message?: unknown; retry?: unknown } | null = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: { code: "invalid-request", message: "The request must be JSON." } },
      { status: 400 },
    );
  }

  let start: Awaited<ReturnType<typeof startTextTurn>>;
  try {
    start = await startTextTurn(getTextSessionDeps(), {
      interviewId: params.id,
      clientMessageId: body.clientMessageId as string,
      message: body.message as string | undefined,
      retry: body.retry === true,
    });
  } catch (error) {
    console.error("Failed to start a text-interview turn:", error);
    return NextResponse.json(
      { error: { code: "server-error", message: "Something went wrong on our side." } },
      { status: 500 },
    );
  }

  if (!start.ok) {
    return NextResponse.json(
      {
        error: {
          code: start.code,
          message: start.message,
          ...(start.endedReason !== undefined ? { endedReason: start.endedReason } : {}),
        },
      },
      { status: start.status },
    );
  }

  const encoder = new TextEncoder();
  const events = start.events;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let clientGone = false;
      try {
        // Always drain the generator, even if the browser disconnects: the
        // reply is stored (and the interview completed, if that was the last
        // turn) as the final steps of the generator.
        for await (const event of events) {
          if (clientGone) continue;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch {
            clientGone = true;
          }
        }
      } catch (error) {
        console.error("Text-interview turn failed while streaming:", error);
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnected client.
        }
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
