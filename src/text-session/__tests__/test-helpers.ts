import type { Interview, Study } from "@/domain";
import { FeedbackAgent, InterviewAgent } from "@/interview-agent";
import { FakeEmailClient } from "@/lib/email";
import { FakeCompletionWebhookClient } from "@/lib/webhook";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewMessageRepository } from "@/repositories/in-memory/in-memory-interview-message-repository";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import type { TextSessionDeps, TextTurnEvent, TextTurnStart } from "../types";

export const scriptedFeedbackSummary = {
  liked: ["The live demo was clear."],
  disliked: ["Q&A ran short."],
  suggestions: ["Leave more time for questions."],
};

/** A time `ms` from the real clock — the in-memory repositories stamp messages with the real clock, so tests move the "current time" relative to it. */
export function inMs(ms: number): Date {
  return new Date(Date.now() + ms);
}

export async function setupTextSession(
  options: { studyType?: "feedback" | "discovery"; mode?: "text" | "voice" } = {},
) {
  const interviewRepo = new InMemoryInterviewRepository();
  const studyRepo = new InMemoryStudyRepository();
  const summaryRepo = new InMemorySummaryRepository();
  const messageRepo = new InMemoryInterviewMessageRepository(interviewRepo);
  const llm = new FakeLLMProvider();
  const emailClient = new FakeEmailClient();
  const webhookClient = new FakeCompletionWebhookClient();
  llm.scriptFeedbackSummary(scriptedFeedbackSummary);

  const study: Study = await studyRepo.create({
    type: options.studyType ?? "feedback",
    title: "Post-webinar feedback",
    description: "quick check-in after today's session",
    preInterviewQuestions: [],
    feedbackQuestions:
      (options.studyType ?? "feedback") === "feedback"
        ? ["What stood out from today's session?"]
        : undefined,
    linkToken: "feedback-token",
  });
  const interview: Interview = await interviewRepo.create({
    studyId: study.id,
    firstName: "Sam",
    email: "sam@example.com",
    trackingId: "tracking-1",
    mode: options.mode ?? "text",
  });

  const deps: TextSessionDeps = {
    interviewAgent: new InterviewAgent(llm),
    feedbackAgent: new FeedbackAgent(llm),
    interviewRepo,
    studyRepo,
    summaryRepo,
    messageRepo,
    llm,
    emailClient,
    webhookClient,
  };

  /** Puts the interview in progress as if its opening greeting had already been sent. */
  async function startedWith(
    messages: { speaker: "interviewer" | "participant"; text: string; clientMessageId?: string }[],
    startedAt: Date = new Date(),
  ) {
    await interviewRepo.update(interview.id, { status: "in-progress", startedAt });
    for (const message of messages) {
      const result = await messageRepo.append({ interviewId: interview.id, ...message });
      if (result.outcome !== "appended") throw new Error(`seed append failed: ${result.outcome}`);
    }
  }

  return {
    deps,
    interviewRepo,
    studyRepo,
    summaryRepo,
    messageRepo,
    llm,
    emailClient,
    webhookClient,
    study,
    interview,
    startedWith,
  };
}

/** Collects every event of a started turn. Throws if the turn was rejected up front. */
export async function drain(start: TextTurnStart): Promise<TextTurnEvent[]> {
  if (!start.ok) throw new Error(`turn rejected: ${start.code} — ${start.message}`);
  const events: TextTurnEvent[] = [];
  for await (const event of start.events) events.push(event);
  return events;
}

export function streamedText(events: TextTurnEvent[]): string {
  return events.flatMap((e) => (e.type === "text-delta" ? [e.text] : [])).join("");
}
