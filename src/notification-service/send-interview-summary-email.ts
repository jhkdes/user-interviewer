import type { EmailClient } from "@/lib/email";
import type { InterviewRepository } from "@/repositories/interview-repository";
import { InterviewNotFoundError } from "./errors";
import { isSubstantiveSummary } from "./is-substantive-summary";
import { renderSummaryEmail } from "./render-summary-email";

export interface SendInterviewSummaryEmailDeps {
  interviewRepo: InterviewRepository;
  emailClient: EmailClient;
  /** Defaults to `new Date()` — overridable so tests can assert on exact timestamps. */
  now?: Date;
}

export interface InterviewSummaryEmailInput {
  painPoints: string[];
  notableQuotes: string[];
  takeaways: string[];
}

export interface SendInterviewSummaryEmailResult {
  /** False when skipped because the summary had nothing substantive to reflect back — not an error. */
  sent: boolean;
}

/**
 * Sends the participant their post-interview "here's what you told us"
 * summary email (#6). Skips (without erroring) when the summary is empty —
 * e.g. a silence-timeout call — per `isSubstantiveSummary`.
 *
 * On success, records `Interview.summaryEmailSentAt` — the durable signal
 * that this actually went out, not just that it was attempted. Left `null`
 * on failure (the thrown error propagates) or on a skip, so
 * `scripts/resend-summary-emails.ts` can later find every completed
 * interview with a summary that still doesn't have one and safely retry —
 * skips are cheap to re-check since `isSubstantiveSummary` is a pure
 * function of the summary content, so nothing is ever wastefully resent.
 *
 * Callers (the Vapi webhook handler, right after `generateIndividualSummary`
 * succeeds, and the backfill script) are responsible for treating a thrown
 * error here as non-fatal, same as summary generation itself: a failed email
 * shouldn't fail the webhook or suggest the interview didn't complete.
 */
export async function sendInterviewSummaryEmail(
  deps: SendInterviewSummaryEmailDeps,
  interviewId: string,
  summary: InterviewSummaryEmailInput,
): Promise<SendInterviewSummaryEmailResult> {
  if (!isSubstantiveSummary(summary)) return { sent: false };

  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview) throw new InterviewNotFoundError(interviewId);

  const { subject, html } = renderSummaryEmail({
    firstName: interview.firstName,
    painPoints: summary.painPoints,
    notableQuotes: summary.notableQuotes,
    takeaways: summary.takeaways,
  });

  await deps.emailClient.send({ to: interview.email, subject, html });
  await deps.interviewRepo.update(interviewId, { summaryEmailSentAt: deps.now ?? new Date() });
  return { sent: true };
}
