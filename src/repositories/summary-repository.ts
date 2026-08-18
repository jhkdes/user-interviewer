import type { Summary } from "@/domain";

export interface CreateSummaryInput {
  interviewId: string;
  painPoints: string[];
  notableQuotes: string[];
  takeaways: string[];
}

export interface SummaryRepository {
  create(input: CreateSummaryInput): Promise<Summary>;
  getByInterviewId(interviewId: string): Promise<Summary | null>;
}
