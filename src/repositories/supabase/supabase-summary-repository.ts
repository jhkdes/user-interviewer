import type { SupabaseClient } from "@supabase/supabase-js";
import type { Summary } from "@/domain";
import type { CreateSummaryInput, SummaryRepository } from "../summary-repository";
import type { SummaryRow } from "./rows";

function toSummary(row: SummaryRow): Summary {
  return {
    id: row.id,
    interviewId: row.interview_id,
    painPoints: row.pain_points as string[],
    notableQuotes: row.notable_quotes as string[],
    takeaways: row.takeaways as string[],
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseSummaryRepository implements SummaryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateSummaryInput): Promise<Summary> {
    const { data, error } = await this.client
      .from("summaries")
      .insert({
        interview_id: input.interviewId,
        pain_points: input.painPoints,
        notable_quotes: input.notableQuotes,
        takeaways: input.takeaways,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create summary: ${error.message}`);
    return toSummary(data as SummaryRow);
  }

  async getByInterviewId(interviewId: string): Promise<Summary | null> {
    const { data, error } = await this.client
      .from("summaries")
      .select()
      .eq("interview_id", interviewId)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch summary: ${error.message}`);
    return data ? toSummary(data as SummaryRow) : null;
  }
}
