import { randomUUID } from "node:crypto";
import type { Summary } from "@/domain";
import type { CreateSummaryInput, SummaryRepository } from "../summary-repository";

export class InMemorySummaryRepository implements SummaryRepository {
  private summariesByInterviewId = new Map<string, Summary>();

  async create(input: CreateSummaryInput): Promise<Summary> {
    const summary: Summary = {
      id: randomUUID(),
      interviewId: input.interviewId,
      painPoints: input.painPoints,
      notableQuotes: input.notableQuotes,
      takeaways: input.takeaways,
      createdAt: new Date(),
    };
    this.summariesByInterviewId.set(input.interviewId, summary);
    return { ...summary };
  }

  async getByInterviewId(interviewId: string): Promise<Summary | null> {
    const summary = this.summariesByInterviewId.get(interviewId);
    return summary ? { ...summary } : null;
  }
}
