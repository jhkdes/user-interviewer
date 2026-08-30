import { NextResponse } from "next/server";
import { fetchConversationAudio } from "@/lib/elevenlabs/client";
import { getInterviewRepository } from "@/repositories/get-interview-repository";

export const dynamic = "force-dynamic";

/**
 * Streams an ElevenLabs interview's recording to the browser. This proxies
 * ElevenLabs' conversation-audio API (which requires a server-side
 * `xi-api-key` header a plain `<audio src>` can't attach) rather than
 * pointing the dashboard at a direct URL — see fetchConversationAudio's doc
 * comment for why this is pull-based instead of the `post_call_audio`
 * webhook.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const interview = await getInterviewRepository().getById(params.id);
  if (
    !interview ||
    interview.voiceProvider !== "elevenlabs" ||
    !interview.elevenLabsConversationId
  ) {
    return NextResponse.json({ error: "Recording not available" }, { status: 404 });
  }

  const audio = await fetchConversationAudio(interview.elevenLabsConversationId);
  if (!audio) {
    return NextResponse.json({ error: "Recording not available" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(audio), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
