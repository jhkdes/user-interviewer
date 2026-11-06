import { NextResponse } from "next/server";
import { fetchSignedUrl } from "@/lib/elevenlabs/client";
import { interpolate } from "@/interview-agent/shared-prompt-parts";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";

export const dynamic = "force-dynamic";

/**
 * Mints a short-lived ElevenLabs signed URL for the given interview's call
 * (see elevenlabs-live-call.tsx) — ElevenLabs, unlike Vapi, doesn't let the
 * browser start a conversation from just a public key, so this server
 * round-trip has no Vapi equivalent. A feedback study that words its own
 * opening line (Study.firstMessage) gets it back too, with the participant's
 * name filled in, for the browser to send as the agent's first-message
 * override; every other study gets none, so the agent's built-in greeting
 * stands.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const interview = await getInterviewRepository().getById(params.id);
  if (!interview || interview.voiceProvider !== "elevenlabs") {
    return NextResponse.json({ error: "Not an ElevenLabs interview" }, { status: 404 });
  }

  const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
  if (!agentId) {
    console.error("Missing required environment variable: NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    return NextResponse.json(
      { error: "The voice interviewer isn't configured yet." },
      { status: 500 },
    );
  }

  const signedUrl = await fetchSignedUrl(agentId);
  if (!signedUrl) {
    return NextResponse.json({ error: "Failed to start the call" }, { status: 502 });
  }

  // A partner interview speaks the opening line it was started with (already filled in).
  let firstMessage: string | undefined;
  if (interview.snapshot) {
    firstMessage = interview.snapshot.firstMessage ?? undefined;
  } else {
    const study = await getStudyRepository().getById(interview.studyId);
    const customOpening = study?.type === "feedback" ? study.firstMessage?.trim() : undefined;
    firstMessage = customOpening
      ? interpolate(customOpening, { participant_name: interview.firstName })
      : undefined;
  }

  return NextResponse.json(firstMessage ? { signedUrl, firstMessage } : { signedUrl });
}
