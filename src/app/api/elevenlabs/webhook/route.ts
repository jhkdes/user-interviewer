import { NextResponse } from "next/server";
import { getEmailClient } from "@/lib/email";
import { verifyWebhookSignature } from "@/lib/elevenlabs/client";
import { getLLMProvider } from "@/llm";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getSummaryRepository } from "@/repositories/get-summary-repository";
import { handleElevenLabsWebhookMessage, type ElevenLabsWebhookPayload } from "@/voice-session";

export const dynamic = "force-dynamic";

/** Replaces a `"full_audio":"<base64>"` value with a short placeholder for logging, leaving everything else (including the actual field, wherever it's used) untouched. */
function truncateFullAudio(rawBody: string): string {
  return rawBody.replace(
    /"full_audio"\s*:\s*"[^"]*"/,
    (match) => `"full_audio":"<omitted, ${match.length} chars>"`,
  );
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  // TEMPORARY — logging the raw payload while confirming ElevenLabs' actual
  // webhook shapes against a live agent. Remove once confirmed. `full_audio`
  // (post_call_audio) is base64 and can be megabytes — truncate it in the
  // log line so it doesn't drown out everything else in the console. This
  // only affects what's printed; signature verification below still uses
  // the untouched `rawBody`.
  console.log("[elevenlabs webhook] raw payload:", truncateFullAudio(rawBody));

  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Missing required environment variable: ELEVENLABS_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  if (!verifyWebhookSignature(rawBody, request.headers.get("elevenlabs-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = (() => {
    try {
      return JSON.parse(rawBody) as ElevenLabsWebhookPayload;
    } catch {
      return null;
    }
  })();
  if (!body?.type) {
    return NextResponse.json({ error: "Request body must include a type" }, { status: 400 });
  }

  try {
    await handleElevenLabsWebhookMessage(
      {
        interviewRepo: getInterviewRepository(),
        summaryRepo: getSummaryRepository(),
        llm: getLLMProvider(),
        emailClient: getEmailClient(),
      },
      body,
    );
  } catch (error) {
    // Most ElevenLabs webhook events don't expect a meaningful response —
    // log and still 200 so a misconfigured or unexpected event doesn't make
    // ElevenLabs retry-storm us or fail the live call (same posture as the
    // Vapi webhook route).
    console.error("Failed to handle ElevenLabs webhook message:", error);
  }

  return NextResponse.json({ received: true });
}
