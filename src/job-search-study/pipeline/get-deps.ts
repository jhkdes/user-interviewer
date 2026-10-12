import Anthropic from "@anthropic-ai/sdk";
import { getEmailClient } from "@/lib/email";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { createClaudeCompletion } from "../extraction/claude-completion";
import { getJobSearchReportRepository } from "../storage/get-report-repository";
import { AUTO_RELEASE_ACTOR, autoReleaseEnabled } from "./auto-release";
import { releaseReport } from "./review-actions";
import type { PipelineDeps, ReviewDeps } from "./types";

/** Live dependencies for reviewer actions (server-only). */
export function getReviewDeps(): ReviewDeps {
  return {
    studyRepo: getStudyRepository(),
    interviewRepo: getInterviewRepository(),
    reportRepo: getJobSearchReportRepository(),
    complete: createClaudeCompletion(new Anthropic()),
    emailClient: getEmailClient(),
  };
}

/**
 * Live dependencies for the report worker (server-only). Clean reports are
 * released and emailed automatically unless AUTO_RELEASE_REPORTS is turned off.
 */
export function getPipelineDeps(): PipelineDeps {
  const review = getReviewDeps();
  const base: PipelineDeps = {
    studyRepo: review.studyRepo,
    interviewRepo: review.interviewRepo,
    reportRepo: review.reportRepo,
    complete: review.complete,
  };
  if (!autoReleaseEnabled()) return base;
  return {
    ...base,
    autoRelease: (reportId) => releaseReport(review, reportId, { releasedBy: AUTO_RELEASE_ACTOR }),
  };
}
