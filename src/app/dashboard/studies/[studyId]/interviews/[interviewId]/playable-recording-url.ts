import type { Interview } from "@/domain";

/**
 * The URL the dashboard's `<audio>` element should play for an interview, or
 * `null` when there is nothing to play.
 *
 * A typed interview has no audio at all, so this answers `null` without ever
 * calling a voice provider — even though the interview still carries the
 * study's `voiceProvider`.
 *
 * For voice interviews: Vapi's presigned recording URL expires ~33 min after
 * the call, so a fresh one is fetched on every view rather than relying on
 * anything stored. ElevenLabs recordings go through a proxy route (see
 * src/app/api/interviews/[id]/recording/route.ts) because ElevenLabs' audio
 * API needs a server-side API key header a plain `<audio src>` can't attach.
 * `recordingUrl` remains as a fallback for interviews recorded before
 * `vapiCallId` was captured.
 */
export async function getPlayableRecordingUrl(
  interview: Pick<
    Interview,
    "id" | "mode" | "voiceProvider" | "elevenLabsConversationId" | "vapiCallId" | "recordingUrl"
  >,
  fetchFreshVapiRecordingUrl: (vapiCallId: string) => Promise<string | null>,
): Promise<string | null> {
  if (interview.mode === "text") return null;

  if (interview.voiceProvider === "elevenlabs") {
    return interview.elevenLabsConversationId ? `/api/interviews/${interview.id}/recording` : null;
  }
  return interview.vapiCallId
    ? await fetchFreshVapiRecordingUrl(interview.vapiCallId)
    : interview.recordingUrl;
}
