import type { Summary, SummaryType } from "@/domain";

export interface CreateSummaryInput {
  interviewId: string;
  /** Defaults to `"discovery"` if omitted, matching the DB column default. */
  type?: SummaryType;
  painPoints?: string[];
  notableQuotes?: string[];
  takeaways?: string[];
  liked?: string[];
  disliked?: string[];
  suggestions?: string[];
}

export interface SummaryRepository {
  create(input: CreateSummaryInput): Promise<Summary>;
  getByInterviewId(interviewId: string): Promise<Summary | null>;
}
