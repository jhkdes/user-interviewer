import { NextResponse } from "next/server";
import { fetchSignedUrl } from "@/lib/elevenlabs/client";
import { getInterviewRepository } from "@/repositories/get-interview-repository";

export const dynamic = "force-dynamic";

/**
 * Mints a short-lived ElevenLabs signed URL for the given interview's call
 * (see elevenlabs-live-call.tsx) — ElevenLabs, unlike Vapi, doesn't let the
 * browser start a conversation from just a public key, so this server
 * round-trip has no Vapi equivalent.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const interview = await getInterviewRepository().getById(params.id);
  if (!interview || interview.voiceProvider !== "elevenlabs") {
    return NextResponse.json({ error: "Not an ElevenLabs interview" }, { status: 404 });
  }

  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  if (!agentId) {
    console.error("Missing required environment variable: NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    return NextResponse.json({ error: "The voice interviewer isn't configured yet." }, { status: 500 });
  }

  const signedUrl = await fetchSignedUrl(agentId);
  if (!signedUrl) {
    return NextResponse.json({ error: "Failed to start the call" }, { status: 502 });
  }

  return NextResponse.json({ signedUrl });
}
