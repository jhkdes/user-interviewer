import { randomUUID } from "node:crypto";
import type { Study, StudyStatus } from "@/domain";
import type { CreateStudyInput, StudyRepository } from "../study-repository";

export class InMemoryStudyRepository implements StudyRepository {
  private studies = new Map<string, Study>();

  async create(input: CreateStudyInput): Promise<Study> {
    const study: Study = {
      id: randomUUID(),
      targetProfile: input.targetProfile,
      researchTopic: input.researchTopic ?? null,
      customPrompt: input.customPrompt ?? null,
      linkToken: input.linkToken,
      voiceProvider: input.voiceProvider ?? "vapi",
      status: "open",
      createdAt: new Date(),
      closedAt: null,
    };
    this.studies.set(study.id, study);
    return { ...study };
  }

  async getById(id: string): Promise<Study | null> {
    const study = this.studies.get(id);
    return study ? { ...study } : null;
  }

  async getByLinkToken(linkToken: string): Promise<Study | null> {
    for (const study of this.studies.values()) {
      if (study.linkToken === linkToken) return { ...study };
    }
    return null;
  }

  async list(): Promise<Study[]> {
    return [...this.studies.values()].map((s) => ({ ...s }));
  }

  async updateStatus(id: string, status: StudyStatus): Promise<Study> {
    const study = this.studies.get(id);
    if (!study) throw new Error(`Study not found: ${id}`);
    const updated: Study = {
      ...study,
      status,
      closedAt: status === "closed" ? new Date() : study.closedAt,
    };
    this.studies.set(id, updated);
    return { ...updated };
  }
}
