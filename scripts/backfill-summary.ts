/**
 * One-off recovery: regenerates the individual summary for a specific
 * interview whose original generateIndividualSummary call failed (e.g. the
 * LLM response was truncated by max_tokens before the JSON output finished —
 * see the adaptive-thinking fix in claude-sonnet-4-6-adapter.ts) and so left
 * no row in `summaries`. Safe only for interviews confirmed to have zero
 * existing summaries — generateIndividualSummary isn't idempotent and would
 * create a duplicate otherwise.
 *
 * Run with: npx tsx --env-file=.env.local scripts/backfill-summary.ts <interviewId>
 */
import { getLLMProvider } from "../src/llm";
import { getInterviewRepository } from "../src/repositories/get-interview-repository";
import { getStudyRepository } from "../src/repositories/get-study-repository";
import { getSummaryRepository } from "../src/repositories/get-summary-repository";
import { generateIndividualSummary } from "../src/summary-service";

async function main() {
  const interviewId = process.argv[2];
  if (!interviewId) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/backfill-summary.ts <interviewId>");
    process.exit(1);
  }

  const interviewRepo = getInterviewRepository();
  const studyRepo = getStudyRepository();
  const summaryRepo = getSummaryRepository();
  const llm = getLLMProvider();

  const existing = await summaryRepo.getByInterviewId(interviewId);
  if (existing) {
    console.error(
      `Interview ${interviewId} already has a summary — refusing to create a duplicate.`,
    );
    process.exit(1);
  }

  const summary = await generateIndividualSummary(
    { interviewRepo, studyRepo, summaryRepo, llm },
    interviewId,
  );
  console.log(`Created summary ${summary.id} for interview ${interviewId}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("Script failed to run:", err);
  process.exit(1);
});
