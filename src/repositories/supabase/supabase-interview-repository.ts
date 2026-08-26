import type { SupabaseClient } from "@supabase/supabase-js";
import type { Interview, InterviewStatus, TranscriptEntry } from "@/domain";
import type {
  CreateInterviewInput,
  InterviewRepository,
  InterviewUpdate,
} from "../interview-repository";
import type { InterviewRow } from "./rows";

function toInterview(row: InterviewRow): Interview {
  return {
    id: row.id,
    studyId: row.study_id,
    firstName: row.first_name,
    email: row.email,
    roleDescription: row.role_description,
    status: row.status as InterviewStatus,
    consentGivenAt: row.consent_given_at ? new Date(row.consent_given_at) : null,
    transcript: (row.transcript as TranscriptEntry[] | null) ?? null,
    recordingUrl: row.recording_url,
    vapiCallId: row.vapi_call_id,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    summaryEmailSentAt: row.summary_email_sent_at ? new Date(row.summary_email_sent_at) : null,
    deviceType: row.device_type,
    endedReason: row.ended_reason,
    backgroundedAt: row.backgrounded_at ? new Date(row.backgrounded_at) : null,
  };
}

function toUpdateRow(patch: InterviewUpdate): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.consentGivenAt !== undefined) {
    row.consent_given_at = patch.consentGivenAt ? patch.consentGivenAt.toISOString() : null;
  }
  if (patch.transcript !== undefined) row.transcript = patch.transcript;
  if (patch.recordingUrl !== undefined) row.recording_url = patch.recordingUrl;
  if (patch.vapiCallId !== undefined) row.vapi_call_id = patch.vapiCallId;
  if (patch.startedAt !== undefined) {
    row.started_at = patch.startedAt ? patch.startedAt.toISOString() : null;
  }
  if (patch.completedAt !== undefined) {
    row.completed_at = patch.completedAt ? patch.completedAt.toISOString() : null;
  }
  if (patch.roleDescription !== undefined) row.role_description = patch.roleDescription;
  if (patch.summaryEmailSentAt !== undefined) {
    row.summary_email_sent_at = patch.summaryEmailSentAt
      ? patch.summaryEmailSentAt.toISOString()
      : null;
  }
  if (patch.endedReason !== undefined) row.ended_reason = patch.endedReason;
  if (patch.backgroundedAt !== undefined) {
    row.backgrounded_at = patch.backgroundedAt ? patch.backgroundedAt.toISOString() : null;
  }
  return row;
}

export class SupabaseInterviewRepository implements InterviewRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateInterviewInput): Promise<Interview> {
    const { data, error } = await this.client
      .from("interviews")
      .insert({
        study_id: input.studyId,
        first_name: input.firstName,
        email: input.email,
        role_description: input.roleDescription ?? null,
        device_type: input.deviceType ?? null,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create interview: ${error.message}`);
    return toInterview(data as InterviewRow);
  }

  async getById(id: string): Promise<Interview | null> {
    const { data, error } = await this.client
      .from("interviews")
      .select()
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch interview: ${error.message}`);
    return data ? toInterview(data as InterviewRow) : null;
  }

  async listByStudyId(studyId: string): Promise<Interview[]> {
    const { data, error } = await this.client
      .from("interviews")
      .select()
      .eq("study_id", studyId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to list interviews: ${error.message}`);
    return (data as InterviewRow[]).map(toInterview);
  }

  async update(id: string, patch: InterviewUpdate): Promise<Interview> {
    const { data, error } = await this.client
      .from("interviews")
      .update(toUpdateRow(patch))
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`Failed to update interview: ${error.message}`);
    if (!data) throw new Error(`Interview not found: ${id}`);
    return toInterview(data as InterviewRow);
  }

  async delete(id: string): Promise<void> {
    const { data, error } = await this.client
      .from("interviews")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) throw new Error(`Failed to delete interview: ${error.message}`);
    if (!data) throw new Error(`Interview not found: ${id}`);
  }
}
