import type { SupabaseClient } from "@supabase/supabase-js";
import type { InterviewMessage } from "@/domain";
import type {
  AppendInterviewMessageInput,
  AppendInterviewMessageResult,
  InterviewMessageRepository,
} from "../interview-message-repository";
import type { InterviewMessageRow } from "./rows";

function toInterviewMessage(row: InterviewMessageRow): InterviewMessage {
  return {
    id: row.id,
    interviewId: row.interview_id,
    seq: row.seq,
    speaker: row.speaker as InterviewMessage["speaker"],
    text: row.text,
    clientMessageId: row.client_message_id,
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseInterviewMessageRepository implements InterviewMessageRepository {
  constructor(private readonly client: SupabaseClient) {}

  async append(input: AppendInterviewMessageInput): Promise<AppendInterviewMessageResult> {
    // The status check, seq assignment, and insert all happen inside the
    // `append_interview_message` function (see 0020_add_text_interview_mode.sql)
    // so they are atomic.
    const { data, error } = await this.client.rpc("append_interview_message", {
      p_interview_id: input.interviewId,
      p_speaker: input.speaker,
      p_text: input.text,
      p_client_message_id: input.clientMessageId ?? null,
      p_after_seq: input.afterSeq ?? null,
    });

    if (error) throw new Error(`Failed to append interview message: ${error.message}`);

    const result = data as { outcome: string; message?: InterviewMessageRow };
    switch (result.outcome) {
      case "appended":
      case "duplicate":
        if (!result.message) {
          throw new Error(
            `append_interview_message returned '${result.outcome}' without a message`,
          );
        }
        return { outcome: result.outcome, message: toInterviewMessage(result.message) };
      case "conflict":
      case "interview-not-in-progress":
      case "interview-not-found":
        return { outcome: result.outcome };
      default:
        throw new Error(`append_interview_message returned unknown outcome: ${result.outcome}`);
    }
  }

  async listByInterviewId(interviewId: string): Promise<InterviewMessage[]> {
    const { data, error } = await this.client
      .from("interview_messages")
      .select()
      .eq("interview_id", interviewId)
      .order("seq", { ascending: true });

    if (error) throw new Error(`Failed to list interview messages: ${error.message}`);
    return (data as InterviewMessageRow[]).map(toInterviewMessage);
  }

  async listInterviewIdsWithMessages(limit: number): Promise<string[]> {
    // PostgREST has no DISTINCT, so read a bounded number of rows and dedupe
    // here. Running interviews hold at most a few dozen rows each, so a few
    // hundred rows cover well over `limit` interviews in practice; anything
    // not reached is picked up by a later sweep.
    const { data, error } = await this.client
      .from("interview_messages")
      .select("interview_id")
      .order("created_at", { ascending: true })
      .limit(limit * 50);

    if (error) throw new Error(`Failed to list interviews with messages: ${error.message}`);
    const ids = new Set((data as { interview_id: string }[]).map((row) => row.interview_id));
    return [...ids].slice(0, limit);
  }

  async deleteByInterviewId(interviewId: string): Promise<void> {
    const { error } = await this.client
      .from("interview_messages")
      .delete()
      .eq("interview_id", interviewId);

    if (error) throw new Error(`Failed to delete interview messages: ${error.message}`);
  }
}
