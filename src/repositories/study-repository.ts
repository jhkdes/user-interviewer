import type {
  ParticipantCopy,
  PreInterviewQuestion,
  ReportPipeline,
  Study,
  StudyStatus,
  StudyType,
  VoiceProvider,
} from "@/domain";

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
  /** Which post-interview report pipeline runs for this study. Omit for none. Immutable after creation. */
  reportPipeline?: ReportPipeline;
  /** Custom landing and ending page text. Omit for the standard wording. */
  participantCopy?: ParticipantCopy;
  /** Custom landing and ending page text for the text link. Omit to follow the voice link's. */
  participantCopyText?: ParticipantCopy;
  linkToken: string;
  /** Discovery-type only. Omit for a study without a text link. */
  textLinkToken?: string;
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
  /** `null` clears it back to the standard wording; `undefined` leaves it untouched. */
  participantCopy?: ParticipantCopy | null;
  /** Text-link landing and ending text. `null` falls back to `participantCopy`; `undefined` leaves it untouched. */
  participantCopyText?: ParticipantCopy | null;
}

export interface StudyRepository {
  create(input: CreateStudyInput): Promise<Study>;
  getById(id: string): Promise<Study | null>;
  /** Finds a study by its voice link token only. See `resolveLink` (study-service) for either link. */
  getByLinkToken(linkToken: string): Promise<Study | null>;
  /** Finds a study by its text link token only. */
  getByTextLinkToken(textLinkToken: string): Promise<Study | null>;
  /**
   * Gives a study a text link, unless it already has one. Returns the study as
   * it stands afterward, so calling it twice is harmless (the first token wins).
   */
  setTextLinkToken(id: string, textLinkToken: string): Promise<Study>;
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
