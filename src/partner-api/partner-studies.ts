import type { Interview, Partner, PartnerInvitation, Study } from "@/domain";
import type { PartnerInvitationRepository } from "@/repositories/partner-invitation-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import { generateLinkToken, getLinkExpiryInfo } from "@/study-service";
import { toLandingCopy } from "./landing-copy";
import {
  DEFAULT_ENDED_EARLY_MIN_TURNS,
  DEFAULT_HARD_STOP_MINUTES,
  DEFAULT_TARGET_MINUTES,
  type ParsedCreate,
  type ParsedInvitation,
  type ParsedPatch,
} from "./study-input";

/** The study is closed in the dashboard, so it cannot take new invitations. */
export class StudyClosedError extends Error {
  constructor() {
    super("This study is closed.");
    this.name = "StudyClosedError";
  }
}

/**
 * Creates a partner's study for one owner, or returns the one it already has.
 * A partner study is a feedback-type study driven by the partner's own prompt:
 * no question list, voice (ElevenLabs), and a text link alongside the voice
 * link like every study.
 */
export async function createPartnerStudy(
  studies: StudyRepository,
  partner: Partner,
  input: ParsedCreate,
): Promise<{ study: Study; created: boolean }> {
  const existing = await studies.getByPartnerOwner(partner.id, input.ownerRef);
  if (existing) return { study: existing, created: false };

  try {
    const study = await studies.create({
      type: "feedback",
      title: input.title,
      // The landing page's default sentence reads "a check-in about {description}".
      description: input.subjectName,
      preInterviewQuestions: [],
      feedbackQuestions: [],
      customPrompt: input.interviewPrompt,
      participantCopy: input.participantCopy ?? undefined,
      firstMessage: input.firstMessage ?? undefined,
      closingQuestion: input.closingQuestion ?? undefined,
      voiceProvider: "elevenlabs",
      linkToken: generateLinkToken(),
      textLinkToken: generateLinkToken(),
      partnerId: partner.id,
      ownerRef: input.ownerRef,
      subjectName: input.subjectName,
      endedEarlyMinTurns: input.endedEarlyMinTurns,
      targetMinutes: input.targetMinutes,
      hardStopMinutes: input.hardStopMinutes,
      participantSummaryEmail: input.participantSummaryEmail,
    });
    return { study, created: true };
  } catch (error) {
    // Two requests for the same owner at once: the unique index let one win.
    const raced = await studies.getByPartnerOwner(partner.id, input.ownerRef);
    if (raced) return { study: raced, created: false };
    throw error;
  }
}

/** Applies a validated `PATCH` to a partner study. */
export async function updatePartnerStudy(
  studies: StudyRepository,
  study: Study,
  patch: ParsedPatch,
): Promise<Study> {
  if (Object.keys(patch).length === 0) return study;
  return studies.updateDetails(study.id, {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.customPrompt !== undefined ? { customPrompt: patch.customPrompt } : {}),
    ...(patch.firstMessage !== undefined ? { firstMessage: patch.firstMessage } : {}),
    ...(patch.closingQuestion !== undefined ? { closingQuestion: patch.closingQuestion } : {}),
    ...(patch.targetMinutes !== undefined ? { targetMinutes: patch.targetMinutes } : {}),
    ...(patch.hardStopMinutes !== undefined ? { hardStopMinutes: patch.hardStopMinutes } : {}),
    ...(patch.endedEarlyMinTurns !== undefined
      ? { endedEarlyMinTurns: patch.endedEarlyMinTurns }
      : {}),
    ...(patch.participantSummaryEmail !== undefined
      ? { participantSummaryEmail: patch.participantSummaryEmail }
      : {}),
    ...(patch.participantCopy !== undefined ? { participantCopy: patch.participantCopy } : {}),
  });
}

/** The study as the API shows it. */
export function studyDto(study: Study) {
  return {
    studyId: study.id,
    ownerRef: study.ownerRef,
    voiceProvider: study.voiceProvider,
    createdAt: study.createdAt.toISOString(),
    expiresAt: getLinkExpiryInfo(study).expiresAt?.toISOString() ?? null,
    title: study.title,
    subjectName: study.subjectName,
    interviewPrompt: study.customPrompt,
    firstMessage: study.firstMessage,
    closingQuestion: study.closingQuestion,
    timing: {
      targetMinutes: study.targetMinutes ?? DEFAULT_TARGET_MINUTES,
      hardStopMinutes: study.hardStopMinutes ?? DEFAULT_HARD_STOP_MINUTES,
    },
    endedEarlyMinTurns: study.endedEarlyMinTurns ?? DEFAULT_ENDED_EARLY_MIN_TURNS,
    participantSummaryEmail: study.participantSummaryEmail,
    landingCopy: toLandingCopy(study.participantCopy),
  };
}

/**
 * Creates a colleague's invitation, or updates the one with the same tracking
 * id (the link stays the same). Either way the study's expiry is extended to at
 * least seven days from now, which is how "regenerate the invite message"
 * keeps every link in the study alive.
 */
export async function issueInvitation(
  deps: { studies: StudyRepository; invitations: PartnerInvitationRepository },
  study: Study,
  input: ParsedInvitation,
): Promise<{ invitation: PartnerInvitation; created: boolean; study: Study }> {
  if (study.status === "closed") throw new StudyClosedError();

  const { invitations } = deps;
  let invitation = await invitations.getByStudyAndTrackingId(study.id, input.trackingId);
  let created = false;

  if (invitation) {
    invitation = await invitations.update(invitation.id, {
      colleagueFirstName: input.colleagueFirstName,
      context: input.context,
    });
  } else {
    try {
      invitation = await invitations.create({ studyId: study.id, ...input });
      created = true;
    } catch (error) {
      const raced = await invitations.getByStudyAndTrackingId(study.id, input.trackingId);
      if (!raced) throw error;
      invitation = await invitations.update(raced.id, {
        colleagueFirstName: input.colleagueFirstName,
        context: input.context,
      });
    }
  }

  const extended = await deps.studies.extendLink(study.id);
  return { invitation, created, study: extended };
}

/** `not_started` (no interview yet), `pending` (one exists, none has ended), `completed` (at least one has ended). */
export type InvitationStatus = "not_started" | "pending" | "completed";

export function invitationStatus(interviews: Interview[]): InvitationStatus {
  if (interviews.length === 0) return "not_started";
  return interviews.some((i) => i.status === "completed") ? "completed" : "pending";
}

export function participantUrl(baseUrl: string, study: Study, trackingId: string): string {
  return `${baseUrl}/interview/${study.linkToken}?tracking_id=${encodeURIComponent(trackingId)}`;
}

/** The address colleagues' links are built on: APP_BASE_URL when set, otherwise the host the request came to. */
export function resolveBaseUrl(request: Request): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  return configured || new URL(request.url).origin;
}

/** An interview as listed under its invitation. No start or end time while it has no result, because ElevenLabs only tells UI when a call has ended. */
export function interviewSummaryDto(interview: Interview) {
  const completed = interview.status === "completed";
  return {
    interviewId: interview.id,
    status: completed ? ("completed" as const) : ("pending" as const),
    endCause: completed ? interview.endCause : null,
    startedAt: completed ? (interview.startedAt?.toISOString() ?? null) : null,
    endedAt: completed ? (interview.completedAt?.toISOString() ?? null) : null,
  };
}

export function invitationDto(
  invitation: PartnerInvitation,
  study: Study,
  interviews: Interview[],
  baseUrl: string,
) {
  const ordered = [...interviews].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    invitationId: invitation.id,
    trackingId: invitation.trackingId,
    colleagueFirstName: invitation.colleagueFirstName,
    context: invitation.context,
    url: participantUrl(baseUrl, study, invitation.trackingId),
    expiresAt: getLinkExpiryInfo(study).expiresAt?.toISOString() ?? null,
    status: invitationStatus(ordered),
    interviews: ordered.map(interviewSummaryDto),
  };
}
