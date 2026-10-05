import type { Interview, InterviewMode, VoiceProvider } from "@/domain";

export interface CreateInterviewInput {
  studyId: string;
  firstName: string;
  email: string;
  /** No longer collected on the intake form (M13) — omit to leave `null`. */
  roleDescription?: string;
  /** Best-effort UA-based detection at intake time — omit to leave `null`. */
  deviceType?: string;
  /** Pre-call screener answers — omit to leave `null`. */
  screenerAnswers?: Record<string, string | string[]>;
  /** Which voice platform will run this interview's call — passed by startInterview (copied from the study). Defaults to `"vapi"` if omitted, matching the DB column default. */
  voiceProvider?: VoiceProvider;
  /** Third-party tracking id passed as the `tracking_id` URL query param on the interview link — omit to leave `null`. */
  trackingId?: string;
  /** Defaults to `"voice"`, matching the DB column default. */
  mode?: InterviewMode;
}

/** Partial update — repositories only persist the fields provided. */
export type InterviewUpdate = Partial<
  Pick<
    Interview,
    | "status"
    | "consentGivenAt"
    | "transcript"
    | "recordingUrl"
    | "vapiCallId"
    | "elevenLabsConversationId"
    | "startedAt"
    | "completedAt"
    | "roleDescription"
    | "summaryEmailSentAt"
    | "endedReason"
    | "backgroundedAt"
    | "timeCheckAskedAt"
    | "extensionGranted"
    | "secondTimeCheckAskedAt"
    | "openFloorAskedAt"
    | "redactedTranscript"
    | "redactedAt"
    | "mode"
    | "lastActivityAt"
    | "idleNudgeSentAt"
    | "switchedToTextAt"
  >
>;

export interface InterviewRepository {
  create(input: CreateInterviewInput): Promise<Interview>;
  getById(id: string): Promise<Interview | null>;
  listByStudyId(studyId: string): Promise<Interview[]>;
  /**
   * How many of the study's interviews are completed *and* have a transcript
   * with at least one turn. A completed interview with no transcript (e.g. a
   * typed interview that timed out before anything was said) is not counted:
   * there is nothing to analyse in it. Zero for an unknown study.
   */
  countCompletedWithTranscript(studyId: string): Promise<number>;
  /** Every text-mode interview that is currently `in-progress`, across all studies — what the idle sweep walks. Oldest first. */
  listActiveTextInterviews(): Promise<Interview[]>;
  update(id: string, patch: InterviewUpdate): Promise<Interview>;
  /**
   * Like `update`, but atomic and conditional: applies `patch` only if the
   * interview is not already `completed`, in a single statement (so two
   * concurrent callers cannot both succeed). Returns the updated interview,
   * or `null` when it was already completed and nothing was changed. Rejects
   * for an unknown id, like `update`. Used by `completeInterview` so a
   * duplicate completion (repeated webhook delivery, a webhook racing another
   * completion path) cannot rewrite the transcript or re-trigger the summary,
   * email, and completion webhook.
   */
  updateIfNotCompleted(id: string, patch: InterviewUpdate): Promise<Interview | null>;
  /** Hard delete — its `Summary` row goes with it via `on delete cascade` (see 0001_init.sql). */
  delete(id: string): Promise<void>;
}
