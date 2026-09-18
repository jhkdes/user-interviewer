import type { PreInterviewQuestion, Study, StudyStatus, StudyType, VoiceProvider } from "@/domain";

export interface CreateStudyInput {
  /** Defaults to `"discovery"` if omitted, matching the DB column default. Immutable after creation — never appears on UpdateStudyDetailsInput. */
  type?: StudyType;
  title: string;
  description: string;
  /** Discovery-type only — omit/empty for feedback-type studies. */
  preInterviewQuestions: PreInterviewQuestion[];
  /** Feedback-type only — omit/empty for discovery-type studies. */
  feedbackQuestions?: string[];
  researchTopic?: string;
  customPrompt?: string;
  linkToken: string;
  /** Defaults to `"vapi"` if omitted, matching the DB column default. */
  voiceProvider?: VoiceProvider;
}

/** Partial update — only the given fields are persisted. `null` clears researchTopic/customPrompt back to "unset"; `undefined` leaves them untouched. No `type` field — a study's type is immutable after creation. */
export interface UpdateStudyDetailsInput {
  title?: string;
  description?: string;
  preInterviewQuestions?: PreInterviewQuestion[];
  feedbackQuestions?: string[];
  researchTopic?: string | null;
  customPrompt?: string | null;
}

export interface StudyRepository {
  create(input: CreateStudyInput): Promise<Study>;
  getById(id: string): Promise<Study | null>;
  getByLinkToken(linkToken: string): Promise<Study | null>;
  list(): Promise<Study[]>;
  updateStatus(id: string, status: StudyStatus): Promise<Study>;
  extendLink(id: string): Promise<Study>;
  updateDetails(id: string, patch: UpdateStudyDetailsInput): Promise<Study>;
  /**
   * Hard delete — an admin-only action, confirmed client-side before the
   * request is ever sent (see remove-study-button.tsx). Every interview
   * belonging to this study goes with it via `on delete cascade` (see
   * 0001_init.sql), and each of those interviews' `Summary` rows cascade
   * again from there; the study's `StudyReport` rows cascade directly.
   */
  delete(id: string): Promise<void>;
}
