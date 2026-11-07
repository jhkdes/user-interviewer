import {
  ProviderDeleteError,
  deletePartnerStudy,
  errorResponse,
  jsonResponse,
  loadPartnerStudy,
  parsePatchStudy,
  readJsonBody,
  studyDto,
  updatePartnerStudy,
  validationErrorResponse,
  withPartner,
} from "@/partner-api";
import { deleteConversationResult } from "@/lib/elevenlabs/client";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";

export const dynamic = "force-dynamic";

type Params = { studyId: string };

export const GET = withPartner<Params>(async ({ request, partner, requestId, params }) => {
  const studies = getStudyRepository();
  const loaded = await loadPartnerStudy(partner, studies, params.studyId, request, requestId, {
    requireOwnerRef: true,
  });
  if (!loaded.ok) return loaded.response;
  return jsonResponse(studyDto(loaded.study), 200, requestId);
});

/**
 * Changes a study's prompt, opening line, closing question, timing, ended-early
 * threshold, summary-email setting, landing text or title. The provider, owner
 * and subject cannot change. The change applies to interviews that start
 * afterward; one already under way keeps what it started with.
 */
export const PATCH = withPartner<Params>(
  async ({ request, partner, requestId, params }) => {
    const studies = getStudyRepository();
    const loaded = await loadPartnerStudy(partner, studies, params.studyId, request, requestId, {
      requireOwnerRef: true,
    });
    if (!loaded.ok) return loaded.response;

    const read = await readJsonBody(request, requestId);
    if (!read.ok) return read.response;

    const parsed = parsePatchStudy(read.body, loaded.study);
    if (!parsed.ok) {
      return parsed.kind === "conflict"
        ? validationErrorResponse(parsed.errors, requestId, "conflict", 409)
        : validationErrorResponse(parsed.errors, requestId);
    }

    const updated = await updatePartnerStudy(studies, loaded.study, parsed.value);
    return jsonResponse(studyDto(updated), 200, requestId);
  },
  { idempotent: true },
);

/**
 * Deletes the study and everything under it: every interview's recording at
 * ElevenLabs, then the transcripts, invitations and any waiting webhook events.
 * Returns `204`. If a recording cannot be removed, nothing is deleted and the
 * call answers `502`, so it can simply be repeated. Used when the partner's
 * user deletes their account.
 */
export const DELETE = withPartner<Params>(
  async ({ request, partner, requestId, params }) => {
    const studies = getStudyRepository();
    const loaded = await loadPartnerStudy(partner, studies, params.studyId, request, requestId, {
      requireOwnerRef: true,
    });
    if (!loaded.ok) return loaded.response;

    try {
      await deletePartnerStudy(
        {
          studies,
          interviews: getInterviewRepository(),
          deleteConversation: deleteConversationResult,
        },
        loaded.study,
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
  },
  { idempotent: true },
);
