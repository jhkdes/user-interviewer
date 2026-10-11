import Anthropic from "@anthropic-ai/sdk";
import { getEmailClient } from "@/lib/email";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { createClaudeCompletion } from "../extraction/claude-completion";
import { getJobSearchReportRepository } from "../storage/get-report-repository";
import type { PipelineDeps, ReviewDeps } from "./types";

/** Live dependencies for the report worker (server-only). */
export function getPipelineDeps(): PipelineDeps {
  return {
    studyRepo: getStudyRepository(),
    interviewRepo: getInterviewRepository(),
    reportRepo: getJobSearchReportRepository(),
    complete: createClaudeCompletion(new Anthropic()),
  };
}

/** Live dependencies for reviewer actions (server-only). */
export function getReviewDeps(): ReviewDeps {
  return { ...getPipelineDeps(), emailClient: getEmailClient() };
}
