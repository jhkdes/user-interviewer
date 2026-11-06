import {
  ProviderDeleteError,
  deletePartnerInterview,
  errorResponse,
  interviewDto,
  invitationFor,
  jsonResponse,
  loadPartnerInterview,
  withPartner,
} from "@/partner-api";
import { deleteConversationResult } from "@/lib/elevenlabs/client";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getPartnerInvitationRepository } from "@/repositories/get-partner-invitation-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";

export const dynamic = "force-dynamic";

type Params = { interviewId: string };

/**
 * One interview: its status, how it ended, when, for how long, and whether a
 * recording exists. Find the interview ids of a colleague through the
 * invitation. The participant's email is never returned.
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

  const invitation = await invitationFor(getPartnerInvitationRepository(), loaded.interview);
  return jsonResponse(interviewDto(loaded.interview, invitation), 200, requestId);
});

/**
 * Deletes one interview: its recording at ElevenLabs, then the transcript,
 * summary and any waiting webhook event. Returns `204`. If the recording
 * cannot be removed, nothing is deleted and the call answers `502`, so it can
 * be repeated. The colleague's invitation stays, and goes back to `not_started`
 * if this was its only interview.
 */
export const DELETE = withPartner<Params>(async ({ request, partner, requestId, params }) => {
  const studies = getStudyRepository();
  const interviews = getInterviewRepository();
  const loaded = await loadPartnerInterview(
    partner,
    { studies, interviews },
    params.interviewId,
    request,
    requestId,
  );
  if (!loaded.ok) return loaded.response;

  try {
    await deletePartnerInterview(
      { studies, interviews, deleteConversation: deleteConversationResult },
      loaded.interview,
    );
  } catch (error) {
    if (error instanceof ProviderDeleteError) {
      return errorResponse(
        "provider_error",
        `${error.message} Nothing was deleted; try again.`,
        502,
        requestId,
      );
    }
    throw error;
  }
  return new Response(null, { status: 204, headers: { "X-Request-Id": requestId } });
});
