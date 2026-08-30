import type { Study, StudyStatus, TargetProfile, VoiceProvider } from "@/domain";

export interface CreateStudyInput {
  targetProfile: TargetProfile;
  researchTopic?: string;
  customPrompt?: string;
  linkToken: string;
  /** Defaults to `"vapi"` if omitted, matching the DB column default. */
  voiceProvider?: VoiceProvider;
}

export interface StudyRepository {
  create(input: CreateStudyInput): Promise<Study>;
  getById(id: string): Promise<Study | null>;
  getByLinkToken(linkToken: string): Promise<Study | null>;
  list(): Promise<Study[]>;
  updateStatus(id: string, status: StudyStatus): Promise<Study>;
}
