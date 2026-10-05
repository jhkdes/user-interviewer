import { randomUUID } from "node:crypto";
import type { Interview } from "@/domain";
import type {
  CreateInterviewInput,
  InterviewRepository,
  InterviewUpdate,
} from "../interview-repository";

export class InMemoryInterviewRepository implements InterviewRepository {
  private interviews = new Map<string, Interview>();

  async create(input: CreateInterviewInput): Promise<Interview> {
    const interview: Interview = {
      id: randomUUID(),
      studyId: input.studyId,
      firstName: input.firstName,
      email: input.email,
      roleDescription: input.roleDescription ?? null,
      status: "pending",
      consentGivenAt: null,
      transcript: null,
      recordingUrl: null,
      vapiCallId: null,
      voiceProvider: input.voiceProvider ?? "vapi",
      elevenLabsConversationId: null,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
      summaryEmailSentAt: null,
      deviceType: input.deviceType ?? null,
      endedReason: null,
      backgroundedAt: null,
      screenerAnswers: input.screenerAnswers ?? null,
      timeCheckAskedAt: null,
      extensionGranted: null,
      secondTimeCheckAskedAt: null,
      openFloorAskedAt: null,
      trackingId: input.trackingId ?? null,
      redactedTranscript: null,
      redactedAt: null,
      mode: input.mode ?? "voice",
      lastActivityAt: null,
      idleNudgeSentAt: null,
      switchedToTextAt: null,
    };
    this.interviews.set(interview.id, interview);
    return { ...interview };
  }

  async getById(id: string): Promise<Interview | null> {
    const interview = this.interviews.get(id);
    return interview ? { ...interview } : null;
  }

  async countCompletedWithTranscript(studyId: string): Promise<number> {
    return [...this.interviews.values()].filter(
      (i) =>
        i.studyId === studyId &&
        i.status === "completed" &&
        i.transcript !== null &&
        i.transcript.length > 0,
    ).length;
  }

  async listActiveTextInterviews(): Promise<Interview[]> {
    return [...this.interviews.values()]
      .filter((i) => i.mode === "text" && i.status === "in-progress")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((i) => ({ ...i }));
  }

  async listByStudyId(studyId: string): Promise<Interview[]> {
    return [...this.interviews.values()]
      .filter((i) => i.studyId === studyId)
      .map((i) => ({ ...i }));
  }

  async update(id: string, patch: InterviewUpdate): Promise<Interview> {
    const interview = this.interviews.get(id);
    if (!interview) throw new Error(`Interview not found: ${id}`);
    const updated: Interview = { ...interview, ...patch };
    this.interviews.set(id, updated);
    return { ...updated };
  }

  async updateIfNotCompleted(id: string, patch: InterviewUpdate): Promise<Interview | null> {
    const interview = this.interviews.get(id);
    if (!interview) throw new Error(`Interview not found: ${id}`);
    if (interview.status === "completed") return null;
    return this.update(id, patch);
  }

  async delete(id: string): Promise<void> {
    if (!this.interviews.delete(id)) throw new Error(`Interview not found: ${id}`);
  }
}
