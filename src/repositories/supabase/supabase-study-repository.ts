import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ParticipantCopy,
  PreInterviewQuestion,
  ReportPipeline,
  Study,
  StudyStatus,
  StudyType,
  VoiceProvider,
} from "@/domain";
import type {
  CreateStudyInput,
  StudyRepository,
  UpdateStudyDetailsInput,
} from "../study-repository";
import type { StudyRow } from "./rows";

function toStudy(row: StudyRow): Study {
  return {
    id: row.id,
    type: row.type as StudyType,
    title: row.title,
    description: row.description,
    preInterviewQuestions: (row.pre_interview_questions as PreInterviewQuestion[] | null) ?? [],
    feedbackQuestions: (row.feedback_questions as string[] | null) ?? [],
    researchTopic: row.research_topic,
    customPrompt: row.custom_prompt,
    reportPipeline: (row.report_pipeline as ReportPipeline | null) ?? null,
    participantCopy: (row.participant_copy as ParticipantCopy | null) ?? null,
    participantCopyText: (row.participant_copy_text as ParticipantCopy | null) ?? null,
    linkToken: row.link_token,
    // `?? null`: the column is absent from rows read before migration 0024 is applied.
    textLinkToken: row.text_link_token ?? null,
    status: row.status as StudyStatus,
    voiceProvider: row.voice_provider as VoiceProvider,
    createdAt: new Date(row.created_at),
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    linkExtendedAt: row.link_extended_at ? new Date(row.link_extended_at) : null,
  };
}

export class SupabaseStudyRepository implements StudyRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateStudyInput): Promise<Study> {
    const { data, error } = await this.client
      .from("studies")
      .insert({
        type: input.type ?? "discovery",
        title: input.title,
        description: input.description,
        pre_interview_questions: input.preInterviewQuestions,
        feedback_questions: input.feedbackQuestions ?? [],
        research_topic: input.researchTopic ?? null,
        custom_prompt: input.customPrompt ?? null,
        report_pipeline: input.reportPipeline ?? null,
        // Only sent when set, so creating a study works before the participant_copy migration is applied.
        ...(input.participantCopy ? { participant_copy: input.participantCopy } : {}),
        link_token: input.linkToken,
        // Only sent when set, so creating a study works before the text-link migration is applied.
        ...(input.textLinkToken ? { text_link_token: input.textLinkToken } : {}),
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

  async getByTextLinkToken(textLinkToken: string): Promise<Study | null> {
    const { data, error } = await this.client
      .from("studies")
      .select()
      .eq("text_link_token", textLinkToken)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch study by text link token: ${error.message}`);
    return data ? toStudy(data as StudyRow) : null;
  }

  async setTextLinkToken(id: string, textLinkToken: string): Promise<Study> {
    // Conditional on the column still being empty, so a concurrent call cannot replace a token that is already in use.
    const { data, error } = await this.client
      .from("studies")
      .update({ text_link_token: textLinkToken })
      .eq("id", id)
      .is("text_link_token", null)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Failed to set study text link token: ${error.message}`);
    if (data) return toStudy(data as StudyRow);

    const existing = await this.getById(id);
    if (!existing) throw new Error(`Study not found: ${id}`);
    return existing;
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

  async extendLink(id: string): Promise<Study> {
    const { data, error } = await this.client
      .from("studies")
      .update({ link_extended_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Failed to extend study link: ${error.message}`);
    if (!data) throw new Error(`Study not found: ${id}`);
    return toStudy(data as StudyRow);
  }

  async updateDetails(id: string, patch: UpdateStudyDetailsInput): Promise<Study> {
    const row: Record<string, unknown> = {};
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.description !== undefined) row.description = patch.description;
    if (patch.preInterviewQuestions !== undefined) {
      row.pre_interview_questions = patch.preInterviewQuestions;
    }
    if (patch.feedbackQuestions !== undefined) row.feedback_questions = patch.feedbackQuestions;
    if (patch.researchTopic !== undefined) row.research_topic = patch.researchTopic;
    if (patch.customPrompt !== undefined) row.custom_prompt = patch.customPrompt;
    if (patch.participantCopy !== undefined) row.participant_copy = patch.participantCopy;
    if (patch.participantCopyText !== undefined) {
      row.participant_copy_text = patch.participantCopyText;
    }

    const { data, error } = await this.client
      .from("studies")
      .update(row)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Failed to update study details: ${error.message}`);
    if (!data) throw new Error(`Study not found: ${id}`);
    return toStudy(data as StudyRow);
  }

  async delete(id: string): Promise<void> {
    const { data, error } = await this.client
      .from("studies")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw new Error(`Failed to delete study: ${error.message}`);
    if (!data) throw new Error(`Study not found: ${id}`);
  }
}
