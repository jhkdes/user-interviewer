import { NextResponse } from "next/server";
import { getLLMProvider } from "@/llm";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getSummaryRepository } from "@/repositories/get-summary-repository";
import { handleVapiWebhookMessage, type VapiWebhookPayload } from "@/voice-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as VapiWebhookPayload | null;
  if (!body?.message) {
    return NextResponse.json({ error: "Request body must include a message" }, { status: 400 });
  }

  try {
    await handleVapiWebhookMessage(
      {
        interviewRepo: getInterviewRepository(),
        summaryRepo: getSummaryRepository(),
        llm: getLLMProvider(),
      },
      body.message,
    );
  } catch (error) {
    // Most Vapi server events are informational and don't expect a
    // meaningful response — log and still 200 so a misconfigured or
    // unexpected event doesn't make Vapi retry-storm us or fail the live call.
    console.error("Failed to handle Vapi webhook message:", error);
  }

  return NextResponse.json({ received: true });
}
