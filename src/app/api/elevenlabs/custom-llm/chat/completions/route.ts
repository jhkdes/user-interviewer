import { NextResponse } from "next/server";
import { InterviewAgent } from "@/interview-agent";
import { getLLMProvider } from "@/llm";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import {
  handleElevenLabsCustomLlmRequest,
  type ElevenLabsCustomLlmChatCompletionRequest,
} from "@/voice-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  // TEMPORARY — logging the raw request while confirming ElevenLabs' actual
  // wire shape against a live agent. Remove once elevenlabs_extra_body's
  // location (and everything else about this request shape) is confirmed.
  console.log("[elevenlabs custom-llm] raw request body:", rawBody);

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

  try {
    const sseBody = await handleElevenLabsCustomLlmRequest(
      {
        interviewAgent: new InterviewAgent(getLLMProvider()),
        interviewRepo: getInterviewRepository(),
        studyRepo: getStudyRepository(),
      },
      body,
    );

    // TEMPORARY — same debugging pass as the raw-request log above.
    console.log("[elevenlabs custom-llm] response SSE body:", sseBody);

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
