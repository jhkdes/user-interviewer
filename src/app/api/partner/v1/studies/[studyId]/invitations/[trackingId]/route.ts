import {
  errorResponse,
  invitationDto,
  jsonResponse,
  loadPartnerStudy,
  resolveBaseUrl,
  withPartner,
} from "@/partner-api";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getPartnerInvitationRepository } from "@/repositories/get-partner-invitation-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";

export const dynamic = "force-dynamic";

type Params = { studyId: string; trackingId: string };

export const GET = withPartner<Params>(async ({ request, partner, requestId, params }) => {
  const loaded = await loadPartnerStudy(
    partner,
    getStudyRepository(),
    params.studyId,
    request,
    requestId,
    { requireOwnerRef: true },
  );
  if (!loaded.ok) return loaded.response;

  const invitation = await getPartnerInvitationRepository().getByStudyAndTrackingId(
    loaded.study.id,
    params.trackingId,
  );
  if (!invitation) return errorResponse("not_found", "Invitation not found.", 404, requestId);

  const interviews = (await getInterviewRepository().listByStudyId(loaded.study.id)).filter(
    (i) => i.invitationId === invitation.id,
  );
  return jsonResponse(
    invitationDto(invitation, loaded.study, interviews, resolveBaseUrl(request)),
    200,
    requestId,
  );
});
