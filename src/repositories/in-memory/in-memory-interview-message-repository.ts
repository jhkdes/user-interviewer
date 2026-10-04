import { randomUUID } from "node:crypto";
import type { InterviewMessage } from "@/domain";
import type {
  AppendInterviewMessageInput,
  AppendInterviewMessageResult,
  InterviewMessageRepository,
} from "../interview-message-repository";
import type { InterviewRepository } from "../interview-repository";

export class InMemoryInterviewMessageRepository implements InterviewMessageRepository {
  private messages: InterviewMessage[] = [];

  /** `interviewRepo` is needed to check the interview exists and is in progress — in Supabase that check lives in the `append_interview_message` SQL function. */
  constructor(private readonly interviewRepo: InterviewRepository) {}

  async append(input: AppendInterviewMessageInput): Promise<AppendInterviewMessageResult> {
    const interview = await this.interviewRepo.getById(input.interviewId);
    if (!interview) return { outcome: "interview-not-found" };

    const existing = this.listSync(input.interviewId);

    // A retry of an already-stored message is answered with the stored one,
    // even if the interview has completed since.
    if (input.clientMessageId !== undefined) {
      const duplicate = existing.find((m) => m.clientMessageId === input.clientMessageId);
      if (duplicate) return { outcome: "duplicate", message: { ...duplicate } };
    }

    if (interview.status !== "in-progress") return { outcome: "interview-not-in-progress" };

    const lastSeq = existing.length === 0 ? 0 : existing[existing.length - 1].seq;
    if (input.afterSeq !== undefined && input.afterSeq !== lastSeq) {
      return { outcome: "conflict" };
    }

    const message: InterviewMessage = {
      id: randomUUID(),
      interviewId: input.interviewId,
      seq: lastSeq + 1,
      speaker: input.speaker,
      text: input.text,
      clientMessageId: input.clientMessageId ?? null,
      createdAt: new Date(),
    };
    this.messages.push(message);
    return { outcome: "appended", message: { ...message } };
  }

  async listByInterviewId(interviewId: string): Promise<InterviewMessage[]> {
    return this.listSync(interviewId).map((m) => ({ ...m }));
  }

  async listInterviewIdsWithMessages(limit: number): Promise<string[]> {
    return [...new Set(this.messages.map((m) => m.interviewId))].slice(0, limit);
  }

  async deleteByInterviewId(interviewId: string): Promise<void> {
    this.messages = this.messages.filter((m) => m.interviewId !== interviewId);
  }

  private listSync(interviewId: string): InterviewMessage[] {
    return this.messages.filter((m) => m.interviewId === interviewId).sort((a, b) => a.seq - b.seq);
  }
}
