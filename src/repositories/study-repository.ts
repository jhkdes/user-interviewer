import type { PreInterviewQuestion, Study, StudyStatus, VoiceProvider } from "@/domain";

export interface CreateStudyInput {
  title: string;
  description: string;
  preInterviewQuestions: PreInterviewQuestion[];
  researchTopic?: string;
  customPrompt?: string;
  linkToken: string;
  /** Defaults to `"vapi"` if omitted, matching the DB column default. */
  voiceProvider?: VoiceProvider;
}

/** Partial update — only the given fields are persisted. `null` clears researchTopic/customPrompt back to "unset"; `undefined` leaves them untouched. */
export interface UpdateStudyDetailsInput {
  title?: string;
  description?: string;
  preInterviewQuestions?: PreInterviewQuestion[];
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
}
