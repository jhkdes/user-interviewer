import { randomUUID } from "node:crypto";
import type { Interview } from "@/domain";
import type {
  CreateInterviewInput,
  InterviewRepository,
  InterviewUpdate,
} from "../interview-repository";

export class InMemoryInterviewRepository implements InterviewRepository {
  private interviews = new Map<string, Interview>();

  async create(input: CreateInterviewInput): Promise<Interview> {
    const interview: Interview = {
      id: randomUUID(),
      studyId: input.studyId,
      firstName: input.firstName,
      email: input.email,
      roleDescription: input.roleDescription ?? null,
      status: "pending",
      consentGivenAt: null,
      transcript: null,
      recordingUrl: null,
      vapiCallId: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    };
    this.interviews.set(interview.id, interview);
    return { ...interview };
  }

  async getById(id: string): Promise<Interview | null> {
    const interview = this.interviews.get(id);
    return interview ? { ...interview } : null;
  }

  async listByStudyId(studyId: string): Promise<Interview[]> {
    return [...this.interviews.values()]
      .filter((i) => i.studyId === studyId)
      .map((i) => ({ ...i }));
  }

  async update(id: string, patch: InterviewUpdate): Promise<Interview> {
    const interview = this.interviews.get(id);
    if (!interview) throw new Error(`Interview not found: ${id}`);
    const updated: Interview = { ...interview, ...patch };
    this.interviews.set(id, updated);
    return { ...updated };
  }
}
