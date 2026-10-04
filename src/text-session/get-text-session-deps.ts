import { FeedbackAgent, InterviewAgent } from "@/interview-agent";
import { getEmailClient } from "@/lib/email";
import { getCompletionWebhookClient } from "@/lib/webhook";
import { getLLMProvider } from "@/llm";
import { getInterviewMessageRepository } from "@/repositories/get-interview-message-repository";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { getSummaryRepository } from "@/repositories/get-summary-repository";
import type { TextSessionDeps } from "./types";

/** Wires the live dependencies for the text-interview API routes (server-only). */
export function getTextSessionDeps(): TextSessionDeps {
  const llm = getLLMProvider();
  return {
    interviewAgent: new InterviewAgent(llm),
    feedbackAgent: new FeedbackAgent(llm),
    interviewRepo: getInterviewRepository(),
    studyRepo: getStudyRepository(),
    summaryRepo: getSummaryRepository(),
    messageRepo: getInterviewMessageRepository(),
    llm,
    emailClient: getEmailClient(),
    webhookClient: getCompletionWebhookClient(),
  };
}
