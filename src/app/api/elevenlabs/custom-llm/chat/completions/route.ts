import { NextResponse } from "next/server";
import { InterviewAgent } from "@/interview-agent";
import { isVoiceSessionDebugEnabled } from "@/lib/debug";
import { getLLMProvider } from "@/llm";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import {
  resolveElevenLabsStreamContext,
  streamElevenLabsCustomLlmResponse,
  type ElevenLabsCustomLlmChatCompletionRequest,
} from "@/voice-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  // Gated — this is real participant conversation content, not something to
  // log unconditionally in production. Set DEBUG_VOICE_SESSION=true to
  // enable (see src/lib/debug.ts).
  if (isVoiceSessionDebugEnabled()) {
    console.log("[elevenlabs custom-llm] raw request body:", rawBody);
  }

  const body = (() => {
    try {
      return JSON.parse(rawBody) as ElevenLabsCustomLlmChatCompletionRequest;
    } catch {
      return null;
    }
  })();
  if (!body) {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  const deps = {
    interviewAgent: new InterviewAgent(getLLMProvider()),
    interviewRepo: getInterviewRepository(),
    studyRepo: getStudyRepository(),
  };

  // Validated eagerly, before the SSE stream opens, so a bad interviewId (or
  // an interview/study that no longer exists) still produces a clean JSON
  // error response rather than an opened-then-immediately-closed stream —
  // response headers can't be changed once the stream below has started.
  let context: Awaited<ReturnType<typeof resolveElevenLabsStreamContext>>;
  try {
    context = await resolveElevenLabsStreamContext(deps, body);
  } catch (error) {
    console.error("Failed to generate the next interview turn:", error);
    return NextResponse.json({ error: "Failed to generate the next turn" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamElevenLabsCustomLlmResponse(deps, body, context)) {
          if (isVoiceSessionDebugEnabled()) {
            console.log("[elevenlabs custom-llm] response SSE chunk:", chunk);
          }
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (error) {
        // The HTTP response is already committed as 200 text/event-stream by
        // this point — there is no way to retroactively turn this into a
        // 500. Best we can do is log and close; ElevenLabs will see a
        // truncated stream (no finish/end_call chunk, no [DONE]).
        console.error("Failed to generate the next interview turn (streaming):", error);
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
