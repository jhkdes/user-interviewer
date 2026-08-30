import type { SupabaseClient } from "@supabase/supabase-js";
import type { Study, StudyStatus, VoiceProvider } from "@/domain";
import type { CreateStudyInput, StudyRepository } from "../study-repository";
import type { StudyRow } from "./rows";

function toStudy(row: StudyRow): Study {
  return {
    id: row.id,
    targetProfile: {
      industry: row.industry,
      yearsOfExperience: row.years_of_experience,
      jobTitle: row.job_title,
      seniority: row.seniority,
      responsibility: row.responsibility,
    },
    researchTopic: row.research_topic,
    customPrompt: row.custom_prompt,
    linkToken: row.link_token,
    status: row.status as StudyStatus,
    voiceProvider: row.voice_provider as VoiceProvider,
    createdAt: new Date(row.created_at),
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
  };
}

export class SupabaseStudyRepository implements StudyRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateStudyInput): Promise<Study> {
    const { data, error } = await this.client
      .from("studies")
      .insert({
        industry: input.targetProfile.industry,
        years_of_experience: input.targetProfile.yearsOfExperience,
        job_title: input.targetProfile.jobTitle,
        seniority: input.targetProfile.seniority,
        responsibility: input.targetProfile.responsibility,
        research_topic: input.researchTopic ?? null,
        custom_prompt: input.customPrompt ?? null,
        link_token: input.linkToken,
        voice_provider: input.voiceProvider ?? "vapi",
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create study: ${error.message}`);
    return toStudy(data as StudyRow);
  }

  async getById(id: string): Promise<Study | null> {
    const { data, error } = await this.client.from("studies").select().eq("id", id).maybeSingle();

    if (error) throw new Error(`Failed to fetch study: ${error.message}`);
    return data ? toStudy(data as StudyRow) : null;
  }

  async getByLinkToken(linkToken: string): Promise<Study | null> {
    const { data, error } = await this.client
      .from("studies")
      .select()
      .eq("link_token", linkToken)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch study by link token: ${error.message}`);
    return data ? toStudy(data as StudyRow) : null;
  }

  async list(): Promise<Study[]> {
    const { data, error } = await this.client
      .from("studies")
      .select()
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to list studies: ${error.message}`);
    return (data as StudyRow[]).map(toStudy);
  }

  async updateStatus(id: string, status: StudyStatus): Promise<Study> {
    const { data, error } = await this.client
      .from("studies")
      .update({ status, closed_at: status === "closed" ? new Date().toISOString() : null })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Failed to update study status: ${error.message}`);
    if (!data) throw new Error(`Study not found: ${id}`);
    return toStudy(data as StudyRow);
  }
}
