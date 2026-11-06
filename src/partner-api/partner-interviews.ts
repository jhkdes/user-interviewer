import type { Interview, Partner, PartnerInvitation, Study } from "@/domain";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { PartnerInvitationRepository } from "@/repositories/partner-invitation-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import { errorResponse } from "./errors";

export type PartnerInterviewResult =
  { ok: true; interview: Interview; study: Study } | { ok: false; response: Response };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Finds an interview for a partner: one that belongs to a study the partner
 * created. Anything else (unknown, another partner's, a dashboard study's,
 * a malformed id) is the same `404`. An `X-Owner-Ref` header is not required
 * here, but if one is sent it must match the study's owner (`409`).
 */
export async function loadPartnerInterview(
  partner: Partner,
  deps: { studies: StudyRepository; interviews: InterviewRepository },
  interviewId: string,
  request: Request,
  requestId: string,
): Promise<PartnerInterviewResult> {
  const notFound = (): PartnerInterviewResult => ({
    ok: false,
    response: errorResponse("not_found", "Interview not found.", 404, requestId),
  });

  if (!UUID.test(interviewId)) return notFound();
  const interview = await deps.interviews.getById(interviewId);
  if (!interview) return notFound();
  const study = await deps.studies.getById(interview.studyId);
  if (!study || study.partnerId !== partner.id) return notFound();

  const ownerRef = request.headers.get("x-owner-ref");
  if (ownerRef !== null && ownerRef !== study.ownerRef) {
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
  return { ok: true, interview, study };
}

/** How long the call ran, in milliseconds; null while there is no result or no times to go on. */
export function interviewDurationMs(interview: Interview): number | null {
  if (interview.status !== "completed") return null;
  if (!interview.startedAt || !interview.completedAt) return null;
  return Math.max(interview.completedAt.getTime() - interview.startedAt.getTime(), 0);
}

const hasEnded = (interview: Interview) => interview.status === "completed";

/** Whether a recording should exist: a voice interview that has ended and has a conversation at the provider. */
export function interviewHasAudio(interview: Interview): boolean {
  return (
    hasEnded(interview) &&
    interview.mode === "voice" &&
    interview.voiceProvider === "elevenlabs" &&
    Boolean(interview.elevenLabsConversationId)
  );
}

/**
 * The interview as the API shows it. No participant email or last name: only
 * the colleague's first name, taken from the invitation. Start, end and
 * duration are null until the interview has ended, because ElevenLabs only
 * tells UI about a call once it is over.
 */
export function interviewDto(interview: Interview, invitation: PartnerInvitation | null) {
  const ended = hasEnded(interview);
  return {
    interviewId: interview.id,
    studyId: interview.studyId,
    invitationId: interview.invitationId,
    trackingId: interview.trackingId,
    colleagueFirstName: invitation?.colleagueFirstName ?? null,
    status: ended ? ("completed" as const) : ("pending" as const),
    endCause: ended ? interview.endCause : null,
    mode: interview.mode,
    startedAt: ended ? (interview.startedAt?.toISOString() ?? null) : null,
    endedAt: ended ? (interview.completedAt?.toISOString() ?? null) : null,
    durationMs: interviewDurationMs(interview),
    participantTurns: (interview.transcript ?? []).filter((t) => t.speaker === "participant")
      .length,
    hasAudio: interviewHasAudio(interview),
  };
}

export async function invitationFor(
  invitations: PartnerInvitationRepository,
  interview: Interview,
): Promise<PartnerInvitation | null> {
  return interview.invitationId ? invitations.getById(interview.invitationId) : null;
}

/**
 * The transcript with turn-level timing only. `startMs` is the provider's
 * start time for the turn (a whole second for ElevenLabs). `endMs` is not
 * measured: it is the next turn's start, or the end of the recording for the
 * last turn. Neither provider gives word-level timing.
 */
export function transcriptDto(interview: Interview) {
  const turns = interview.transcript ?? [];
  const durationMs = interviewDurationMs(interview);
  return {
    interviewId: interview.id,
    timing: "turn" as const,
    durationMs,
    turns: turns.map((turn, index) => {
      const next = turns[index + 1];
      const endMs = next ? next.timestampMs : (durationMs ?? turn.timestampMs);
      return {
        index,
        speaker: turn.speaker,
        text: turn.text,
        startMs: turn.timestampMs,
        endMs: Math.max(endMs, turn.timestampMs),
      };
    }),
  };
}
