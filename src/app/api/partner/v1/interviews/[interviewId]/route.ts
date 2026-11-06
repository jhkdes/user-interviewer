import {
  interviewDto,
  invitationFor,
  jsonResponse,
  loadPartnerInterview,
  withPartner,
} from "@/partner-api";
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
