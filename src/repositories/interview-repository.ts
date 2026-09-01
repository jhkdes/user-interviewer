import type { Interview, VoiceProvider } from "@/domain";

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
  >
>;

export interface InterviewRepository {
  create(input: CreateInterviewInput): Promise<Interview>;
  getById(id: string): Promise<Interview | null>;
  listByStudyId(studyId: string): Promise<Interview[]>;
  update(id: string, patch: InterviewUpdate): Promise<Interview>;
  /** Hard delete — its `Summary` row goes with it via `on delete cascade` (see 0001_init.sql). */
  delete(id: string): Promise<void>;
}
