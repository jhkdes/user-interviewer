import { fetchConversationAudioResult } from "@/lib/elevenlabs/client";
import {
  audioResponse,
  cachedAudio,
  errorResponse,
  interviewHasAudio,
  loadPartnerInterview,
  rememberAudio,
  withPartner,
} from "@/partner-api";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";

export const dynamic = "force-dynamic";

type Params = { interviewId: string };

/**
 * The interview's recording, streamed through UI so a provider link never
 * leaves the server. MP3, mono, 16 kHz, both speakers mixed. Supports a single
 * `Range` span (UI cuts it out of the whole file, because ElevenLabs ignores
 * Range). `404` when there is no recording, such as a typed interview; `409`
 * before the interview has ended; `502` when the provider could not be
 * reached, which is worth retrying.
 */
export const GET = withPartner<Params>(async ({ request, partner, requestId, params }) => {
  const loaded = await loadPartnerInterview(
    partner,
    { studies: getStudyRepository(), interviews: getInterviewRepository() },
    params.interviewId,
    request,
    requestId,
  );
  if (!loaded.ok) return loaded.response;
  const { interview } = loaded;

  if (interview.status !== "completed") {
    return errorResponse("conflict", "The interview has not ended yet.", 409, requestId);
  }
  if (!interviewHasAudio(interview) || !interview.elevenLabsConversationId) {
    return errorResponse("not_found", "This interview has no recording.", 404, requestId);
  }

  const conversationId = interview.elevenLabsConversationId;
  let audio = cachedAudio(conversationId);
  if (!audio) {
    const fetched = await fetchConversationAudioResult(conversationId);
    if (!fetched.ok) {
      // A 4xx from the provider means it has no recording (yet); anything else is a failure to retry.
      return fetched.status >= 400 && fetched.status < 500
        ? errorResponse("not_found", "The recording is not available.", 404, requestId)
        : errorResponse("provider_error", "The recording could not be fetched.", 502, requestId);
    }
    audio = fetched.audio;
    rememberAudio(conversationId, audio);
  }

  return audioResponse(audio, request.headers.get("range"), requestId);
});
