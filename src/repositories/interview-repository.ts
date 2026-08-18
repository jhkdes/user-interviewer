import type { Interview } from "@/domain";

export interface CreateInterviewInput {
  studyId: string;
  firstName: string;
  email: string;
  roleDescription: string;
}

/** Partial update — repositories only persist the fields provided. */
export type InterviewUpdate = Partial<
  Pick<
    Interview,
    "status" | "consentGivenAt" | "transcript" | "recordingUrl" | "startedAt" | "completedAt"
  >
>;

export interface InterviewRepository {
  create(input: CreateInterviewInput): Promise<Interview>;
  getById(id: string): Promise<Interview | null>;
  listByStudyId(studyId: string): Promise<Interview[]>;
  update(id: string, patch: InterviewUpdate): Promise<Interview>;
}
