import { decodeInvitationCursor } from "@/repositories/partner-invitation-repository";
import {
  StudyClosedError,
  errorResponse,
  invitationDto,
  issueInvitation,
  jsonResponse,
  loadPartnerStudy,
  parseInvitation,
  readJsonBody,
  resolveBaseUrl,
  validationErrorResponse,
  withPartner,
} from "@/partner-api";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getPartnerInvitationRepository } from "@/repositories/get-partner-invitation-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";

export const dynamic = "force-dynamic";

type Params = { studyId: string };

/**
 * Creates one colleague's invitation, or updates the one with the same
 * `trackingId` (its link stays the same). Every call also extends the study's
 * expiry to at least seven days from now.
 */
export const POST = withPartner<Params>(async ({ request, partner, requestId, params }) => {
  const studies = getStudyRepository();
  const loaded = await loadPartnerStudy(partner, studies, params.studyId, request, requestId, {
    requireOwnerRef: true,
  });
  if (!loaded.ok) return loaded.response;

  const read = await readJsonBody(request, requestId);
  if (!read.ok) return read.response;
  const parsed = parseInvitation(read.body);
  if (!parsed.ok) {
    return parsed.kind === "invalid_tracking_id"
      ? validationErrorResponse(parsed.errors, requestId, "invalid_tracking_id", 422)
      : validationErrorResponse(parsed.errors, requestId);
  }

  try {
    const { invitation, created, study } = await issueInvitation(
      { studies, invitations: getPartnerInvitationRepository() },
      loaded.study,
      parsed.value,
    );
    const interviews = (await getInterviewRepository().listByStudyId(study.id)).filter(
      (i) => i.invitationId === invitation.id,
    );
    return jsonResponse(
      invitationDto(invitation, study, interviews, resolveBaseUrl(request)),
      created ? 201 : 200,
      requestId,
    );
  } catch (error) {
    if (error instanceof StudyClosedError) {
      return errorResponse("conflict", error.message, 409, requestId);
    }
    throw error;
  }
});

/** The study's invitations, oldest first, with each one's status and interviews. */
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

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 200)) {
    return validationErrorResponse(["limit must be a whole number from 1 to 200"], requestId);
  }
  const cursor = url.searchParams.get("cursor");
  if (cursor && !decodeInvitationCursor(cursor)) {
    return validationErrorResponse(["cursor is not valid"], requestId);
  }

  const page = await getPartnerInvitationRepository().listByStudyId(loaded.study.id, {
    limit,
    cursor,
  });
  const interviews = await getInterviewRepository().listByStudyId(loaded.study.id);
  const baseUrl = resolveBaseUrl(request);

  return jsonResponse(
    {
      invitations: page.items.map((invitation) =>
        invitationDto(
          invitation,
          loaded.study,
          interviews.filter((i) => i.invitationId === invitation.id),
          baseUrl,
        ),
      ),
      nextCursor: page.nextCursor,
    },
    200,
    requestId,
  );
});
