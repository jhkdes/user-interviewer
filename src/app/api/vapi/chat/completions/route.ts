import { NextResponse } from "next/server";
import { InterviewAgent } from "@/interview-agent";
import { isVoiceSessionDebugEnabled } from "@/lib/debug";
import { getLLMProvider } from "@/llm";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import {
  handleVapiCustomLlmRequest,
  type VapiCustomLlmChatCompletionRequest,
} from "@/voice-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  // Gated — this is real participant conversation content, not something to
  // log unconditionally in production. Set DEBUG_VOICE_SESSION=true to
  // enable (see src/lib/debug.ts).
  if (isVoiceSessionDebugEnabled()) {
    console.log("[vapi custom-llm] raw request body:", rawBody);
  }

  const body = (() => {
    try {
      return JSON.parse(rawBody) as VapiCustomLlmChatCompletionRequest;
    } catch {
      return null;
    }
  })();
  if (!body) {
    return NextResponse.json({ error: "Request body must be JSON" }, { status: 400 });
  }

  try {
    const sseBody = await handleVapiCustomLlmRequest(
      {
        interviewAgent: new InterviewAgent(getLLMProvider()),
        interviewRepo: getInterviewRepository(),
        studyRepo: getStudyRepository(),
      },
      body,
    );

    if (isVoiceSessionDebugEnabled()) {
      console.log("[vapi custom-llm] response SSE body:", sseBody);
    }

    return new NextResponse(sseBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Failed to generate the next interview turn:", error);
    return NextResponse.json({ error: "Failed to generate the next turn" }, { status: 500 });
  }
}
