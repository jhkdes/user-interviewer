import type { Partner, Study } from "@/domain";
import type { StudyRepository } from "@/repositories/study-repository";
import { errorResponse } from "./errors";

export type PartnerStudyResult = { ok: true; study: Study } | { ok: false; response: Response };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds a study for a partner. A partner can only see studies created with its
 * own key: a study that does not exist, belongs to another partner, or was
 * made in the dashboard is `404` for every one of those reasons, so ids cannot
 * be probed.
 *
 * With `requireOwnerRef`, the request must also carry `X-Owner-Ref`, and it
 * must match the study's owner (defense in depth against the partner mixing up
 * two of its own users): missing is `400`, a mismatch is `409`. The owner check
 * only runs after the study is known to be the partner's, so it cannot be used
 * to probe either.
 */
export async function loadPartnerStudy(
  partner: Partner,
  studies: StudyRepository,
  studyId: string,
  request: Request,
  requestId: string,
  options: { requireOwnerRef?: boolean } = {},
): Promise<PartnerStudyResult> {
  const notFound = (): PartnerStudyResult => ({
    ok: false,
    response: errorResponse("not_found", "Study not found.", 404, requestId),
  });

  if (!UUID.test(studyId)) return notFound();
  const study = await studies.getById(studyId);
  if (!study || study.partnerId !== partner.id) return notFound();

  if (options.requireOwnerRef) {
    const ownerRef = request.headers.get("x-owner-ref");
    if (!ownerRef) {
      return {
        ok: false,
        response: errorResponse(
          "invalid_request",
          "The X-Owner-Ref header is required.",
          400,
          requestId,
        ),
      };
    }
    if (ownerRef !== study.ownerRef) {
      return {
        ok: false,
        response: errorResponse(
          "conflict",
          "X-Owner-Ref does not match this study's owner.",
          409,
          requestId,
        ),
      };
    }
  }

  return { ok: true, study };
}
