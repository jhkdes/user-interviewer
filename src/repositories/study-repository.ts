import type { Study, StudyStatus, TargetProfile } from "@/domain";

export interface CreateStudyInput {
  targetProfile: TargetProfile;
  linkToken: string;
}

export interface StudyRepository {
  create(input: CreateStudyInput): Promise<Study>;
  getById(id: string): Promise<Study | null>;
  getByLinkToken(linkToken: string): Promise<Study | null>;
  list(): Promise<Study[]>;
  updateStatus(id: string, status: StudyStatus): Promise<Study>;
}
