import { NextResponse } from "next/server";
import { InterviewAgent } from "@/interview-agent";
import { getLLMProvider } from "@/llm";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { handleVapiCustomLlmRequest, type VapiCustomLlmChatCompletionRequest } from "@/voice-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as VapiCustomLlmChatCompletionRequest | null;
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
