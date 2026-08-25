/**
 * Recovery script (#6 resilience): finds every completed interview that has
 * a summary but never got its "here's what you told us" email sent
 * (`summaryEmailSentAt` is still null) — e.g. interviews that completed
 * before RESEND_API_KEY was configured, or that hit a non-retryable send
 * failure — and resends for each. Safe to run repeatedly: interviews that
 * already have `summaryEmailSentAt` set are skipped, and
 * `sendInterviewSummaryEmail` itself skips (cheaply, no network call) any
 * summary with nothing substantive to send, exactly as it would on the
 * original attempt.
 *
 * Requires RESEND_API_KEY, RESEND_FROM_EMAIL, and the Supabase env vars
 * (already in .env.local).
 *
 * Run with: npm run resend:summary-emails
 */
import { getEmailClient } from "../src/lib/email";
import { sendInterviewSummaryEmail } from "../src/notification-service";
import { getInterviewRepository } from "../src/repositories/get-interview-repository";
import { getStudyRepository } from "../src/repositories/get-study-repository";
import { getSummaryRepository } from "../src/repositories/get-summary-repository";

async function main() {
  const interviewRepo = getInterviewRepository();
  const studyRepo = getStudyRepository();
  const summaryRepo = getSummaryRepository();
  const emailClient = getEmailClient();

  const studies = await studyRepo.list();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const study of studies) {
    const interviews = await interviewRepo.listByStudyId(study.id);

    for (const interview of interviews) {
      if (interview.status !== "completed" || interview.summaryEmailSentAt) continue;

      const summary = await summaryRepo.getByInterviewId(interview.id);
      if (!summary) continue; // no summary yet — not this script's job

      try {
        const result = await sendInterviewSummaryEmail(
          { interviewRepo, emailClient },
          interview.id,
          summary,
        );
        if (result.sent) {
          console.log(`  \x1b[32m✓\x1b[0m sent to ${interview.email} (interview ${interview.id})`);
          sent++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`  \x1b[31m✗\x1b[0m failed for interview ${interview.id}:`, error);
        failed++;
      }
    }
  }

  console.log(`\n${sent} sent, ${skipped} skipped (no substantive summary), ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Script failed to run:", err);
  process.exit(1);
});
