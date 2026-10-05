import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Interview,
  InterviewMode,
  InterviewStatus,
  TranscriptEntry,
  VoiceProvider,
} from "@/domain";
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
    voiceProvider: row.voice_provider as VoiceProvider,
    elevenLabsConversationId: row.elevenlabs_conversation_id,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    summaryEmailSentAt: row.summary_email_sent_at ? new Date(row.summary_email_sent_at) : null,
    deviceType: row.device_type,
    endedReason: row.ended_reason,
    backgroundedAt: row.backgrounded_at ? new Date(row.backgrounded_at) : null,
    screenerAnswers: (row.screener_answers as Record<string, string | string[]> | null) ?? null,
    timeCheckAskedAt: row.time_check_asked_at ? new Date(row.time_check_asked_at) : null,
    extensionGranted: row.extension_granted,
    secondTimeCheckAskedAt: row.second_time_check_asked_at
      ? new Date(row.second_time_check_asked_at)
      : null,
    openFloorAskedAt: row.open_floor_asked_at ? new Date(row.open_floor_asked_at) : null,
    trackingId: row.tracking_id,
    redactedTranscript: (row.redacted_transcript as TranscriptEntry[] | null) ?? null,
    redactedAt: row.redacted_at ? new Date(row.redacted_at) : null,
    mode: row.mode as InterviewMode,
    lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at) : null,
    idleNudgeSentAt: row.idle_nudge_sent_at ? new Date(row.idle_nudge_sent_at) : null,
    switchedToTextAt: row.switched_to_text_at ? new Date(row.switched_to_text_at) : null,
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
  if (patch.elevenLabsConversationId !== undefined) {
    row.elevenlabs_conversation_id = patch.elevenLabsConversationId;
  }
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
  if (patch.timeCheckAskedAt !== undefined) {
    row.time_check_asked_at = patch.timeCheckAskedAt ? patch.timeCheckAskedAt.toISOString() : null;
  }
  if (patch.extensionGranted !== undefined) row.extension_granted = patch.extensionGranted;
  if (patch.secondTimeCheckAskedAt !== undefined) {
    row.second_time_check_asked_at = patch.secondTimeCheckAskedAt
      ? patch.secondTimeCheckAskedAt.toISOString()
      : null;
  }
  if (patch.openFloorAskedAt !== undefined) {
    row.open_floor_asked_at = patch.openFloorAskedAt ? patch.openFloorAskedAt.toISOString() : null;
  }
  if (patch.redactedTranscript !== undefined) row.redacted_transcript = patch.redactedTranscript;
  if (patch.redactedAt !== undefined) {
    row.redacted_at = patch.redactedAt ? patch.redactedAt.toISOString() : null;
  }
  if (patch.mode !== undefined) row.mode = patch.mode;
  if (patch.lastActivityAt !== undefined) {
    row.last_activity_at = patch.lastActivityAt ? patch.lastActivityAt.toISOString() : null;
  }
  if (patch.idleNudgeSentAt !== undefined) {
    row.idle_nudge_sent_at = patch.idleNudgeSentAt ? patch.idleNudgeSentAt.toISOString() : null;
  }
  if (patch.switchedToTextAt !== undefined) {
    row.switched_to_text_at = patch.switchedToTextAt ? patch.switchedToTextAt.toISOString() : null;
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
        screener_answers: input.screenerAnswers ?? null,
        voice_provider: input.voiceProvider ?? "vapi",
        tracking_id: input.trackingId ?? null,
        mode: input.mode ?? "voice",
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

  async countCompletedWithTranscript(studyId: string): Promise<number> {
    // A head request with an exact count: the database counts, no rows come
    // back. `transcript` is jsonb, so "not null and not the empty array" is
    // "has at least one turn".
    const { count, error } = await this.client
      .from("interviews")
      .select("id", { count: "exact", head: true })
      .eq("study_id", studyId)
      .eq("status", "completed")
      .not("transcript", "is", null)
      .neq("transcript", "[]");

    if (error) throw new Error(`Failed to count completed interviews: ${error.message}`);
    return count ?? 0;
  }

  async listActiveTextInterviews(): Promise<Interview[]> {
    const { data, error } = await this.client
      .from("interviews")
      .select()
      .eq("mode", "text")
      .eq("status", "in-progress")
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to list active text interviews: ${error.message}`);
    return (data as InterviewRow[]).map(toInterview);
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

  async updateIfNotCompleted(id: string, patch: InterviewUpdate): Promise<Interview | null> {
    // One conditional UPDATE: Postgres re-checks the `status <> 'completed'`
    // filter against the latest committed row after waiting on any concurrent
    // writer's row lock, so only one of two racing callers can match.
    const { data, error } = await this.client
      .from("interviews")
      .update(toUpdateRow(patch))
      .eq("id", id)
      .neq("status", "completed")
      .select()
      .maybeSingle();

    if (error) throw new Error(`Failed to update interview: ${error.message}`);
    if (data) return toInterview(data as InterviewRow);

    // No row matched: either it is already completed, or it doesn't exist.
    if (!(await this.getById(id))) throw new Error(`Interview not found: ${id}`);
    return null;
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
