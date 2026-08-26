import type { Interview } from "@/domain";

export interface CreateInterviewInput {
  studyId: string;
  firstName: string;
  email: string;
  /** No longer collected on the intake form (M13) — omit to leave `null`. */
  roleDescription?: string;
  /** Best-effort UA-based detection at intake time — omit to leave `null`. */
  deviceType?: string;
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
    | "startedAt"
    | "completedAt"
    | "roleDescription"
    | "summaryEmailSentAt"
    | "endedReason"
    | "backgroundedAt"
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
