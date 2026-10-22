import { NextResponse } from "next/server";
import { fetchConversationAudio } from "@/lib/elevenlabs/client";
import { getCurrentPmContext } from "@/pm-auth/current-pm-context";
import { authorizeStudyRead } from "@/pm-auth";
import { getInterviewRepository } from "@/repositories/get-interview-repository";

export const dynamic = "force-dynamic";

/**
 * Streams an ElevenLabs interview's recording to the browser. This proxies
 * ElevenLabs' conversation-audio API (which requires a server-side
 * `xi-api-key` header a plain `<audio src>` can't attach) rather than
 * pointing the dashboard at a direct URL — see fetchConversationAudio's doc
 * comment for why this is pull-based instead of the `post_call_audio`
 * webhook.
 *
 * Only dashboard users may fetch audio: an admin, or a viewer granted the
 * interview's study. This route sits outside the middleware matcher (its
 * path is under `/api/interviews`, shared with the participant routes), so
 * it checks the session itself. Participants never call it.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await getCurrentPmContext();
  // Answer before touching the database, so a signed-out caller learns nothing about the id.
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const interview = await getInterviewRepository().getById(params.id);
  if (interview) {
    const access = authorizeStudyRead(ctx, interview.studyId, interview.status);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (
    !interview ||
    interview.mode === "text" ||
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
