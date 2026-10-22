import { NextResponse } from "next/server";
import { fetchConversationAudio } from "@/lib/elevenlabs/client";
import { fetchFreshRecordingUrl } from "@/lib/vapi/client";
import { getCurrentPmContext } from "@/pm-auth/current-pm-context";
import { authorizeStudyRead } from "@/pm-auth";
import { getInterviewRepository } from "@/repositories/get-interview-repository";

export const dynamic = "force-dynamic";

/**
 * Streams an interview's recording to the browser, for both voice providers.
 *
 * ElevenLabs: proxies ElevenLabs' conversation-audio API (which requires a
 * server-side `xi-api-key` header a plain `<audio src>` can't attach) rather
 * than pointing the dashboard at a direct URL — see fetchConversationAudio's
 * doc comment for why this is pull-based instead of the `post_call_audio`
 * webhook.
 *
 * Vapi: fetches a fresh presigned URL and streams the audio through, so a
 * viewer never receives that URL (it is a bearer link that would work for
 * anyone it was passed to). The browser's `Range` header is forwarded so the
 * player can seek.
 *
 * Only dashboard users may fetch audio: an admin, or a viewer granted the
 * interview's study. This route sits outside the middleware matcher (its
 * path is under `/api/interviews`, shared with the participant routes), so
 * it checks the session itself. Participants never call it.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const ctx = await getCurrentPmContext();
  // Answer before touching the database, so a signed-out caller learns nothing about the id.
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ctx.role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const interview = await getInterviewRepository().getById(params.id);
  if (interview) {
    const access = authorizeStudyRead(ctx, interview.studyId, interview.status);
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  }
  if (!interview || interview.mode === "text") return notAvailable();

  if (interview.voiceProvider === "elevenlabs") {
    if (!interview.elevenLabsConversationId) return notAvailable();
    const audio = await fetchConversationAudio(interview.elevenLabsConversationId);
    if (!audio) return notAvailable();
    return new NextResponse(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  }

  const url = interview.vapiCallId
    ? await fetchFreshRecordingUrl(interview.vapiCallId)
    : interview.recordingUrl;
  if (!url) return notAvailable();

  const range = request.headers.get("range");
  const upstream = await fetch(url, { headers: range ? { Range: range } : {}, cache: "no-store" });
  if (!upstream.ok || !upstream.body) return notAvailable();

  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(name);
    if (value) headers[name] = value;
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

function notAvailable() {
  return NextResponse.json({ error: "Recording not available" }, { status: 404 });
}
