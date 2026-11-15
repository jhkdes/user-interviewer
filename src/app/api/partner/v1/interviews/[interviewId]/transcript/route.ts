import {
  errorResponse,
  jsonResponse,
  loadPartnerInterview,
  transcriptDto,
  withPartner,
} from "@/partner-api";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";

export const dynamic = "force-dynamic";

type Params = { interviewId: string };

/**
 * The interview's transcript, turn by turn, with turn-level timing only
 * (`timing` is always "turn"; there is no word-level timing). Available once
 * the interview has ended; before that, `409`.
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

  if (loaded.interview.status !== "completed") {
    return errorResponse("conflict", "The interview has not ended yet.", 409, requestId);
  }
  return jsonResponse(transcriptDto(loaded.interview), 200, requestId);
});
