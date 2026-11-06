import {
  createPartnerStudy,
  jsonResponse,
  parseCreateStudy,
  readJsonBody,
  studyDto,
  validationErrorResponse,
  withPartner,
} from "@/partner-api";
import { getStudyRepository } from "@/repositories/get-study-repository";

export const dynamic = "force-dynamic";

/**
 * Creates the study for one owner (the partner's own user), or returns the one
 * it already has: calling twice never makes a second study, and the second
 * call's body is ignored (use PATCH to change a study).
 */
export const POST = withPartner(async ({ request, partner, requestId }) => {
  const read = await readJsonBody(request, requestId);
  if (!read.ok) return read.response;

  const parsed = parseCreateStudy(read.body);
  if (!parsed.ok) {
    return parsed.kind === "unsupported_provider"
      ? validationErrorResponse(parsed.errors, requestId, "unsupported_provider", 422)
      : validationErrorResponse(parsed.errors, requestId);
  }

  const { study, created } = await createPartnerStudy(getStudyRepository(), partner, parsed.value);
  return jsonResponse(studyDto(study), created ? 201 : 200, requestId);
});
