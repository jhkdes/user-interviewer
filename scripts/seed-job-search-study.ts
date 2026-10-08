/**
 * Creates the "How Job Seekers Get Interviews" study: title, description,
 * the 10-question screener with its stable ids, and the interviewer prompt
 * from JOB_SEARCH_INTERVIEWER_PROMPT.md as the study's custom prompt.
 *
 * Study.customPrompt can only be set at creation (there is no update
 * endpoint), so to change the prompt later use scripts/update-study-custom-prompt.ts
 * as a model. The dashboard's "New Study" wizard assigns random UUIDs to
 * screener questions, so it cannot be used to create this study: the report
 * pipeline needs the readable ids from study-config.ts.
 *
 * Writes to the database named by SUPABASE_URL (preview and production share
 * one). Run with --dry-run first. --title labels a test study, and
 * --voice-provider=vapi|elevenlabs picks the voice platform (fixed at creation;
 * defaults to the repository default, vapi):
 *   npx tsx --env-file=.env.local scripts/seed-job-search-study.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/seed-job-search-study.ts --title="[TEST] How Job Seekers Get Interviews" --voice-provider=elevenlabs
 */
import { loadJobSearchInterviewerPrompt } from "../src/job-search-study/interviewer-prompt";
import {
  JOB_SEARCH_SCREENER,
  JOB_SEARCH_STUDY_DESCRIPTION,
  JOB_SEARCH_STUDY_TITLE,
} from "../src/job-search-study/study-config";
import { getStudyRepository } from "../src/repositories/get-study-repository";
import { createStudy, validateStudyInput } from "../src/study-service";
import type { VoiceProvider } from "../src/domain";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const titleArg = process.argv.find((arg) => arg.startsWith("--title="));
  const providerArg = process.argv.find((arg) => arg.startsWith("--voice-provider="));
  const voiceProvider = providerArg?.slice("--voice-provider=".length);
  if (voiceProvider !== undefined && voiceProvider !== "vapi" && voiceProvider !== "elevenlabs") {
    console.error(`--voice-provider must be "vapi" or "elevenlabs", got "${voiceProvider}"`);
    process.exit(1);
  }
  const input = {
    title: titleArg ? titleArg.slice("--title=".length) : JOB_SEARCH_STUDY_TITLE,
    description: JOB_SEARCH_STUDY_DESCRIPTION,
    preInterviewQuestions: JOB_SEARCH_SCREENER,
    customPrompt: loadJobSearchInterviewerPrompt(),
    reportPipeline: "job-search" as const,
    voiceProvider: voiceProvider as VoiceProvider | undefined,
  };

  const validation = validateStudyInput(input);
  if (!validation.valid) {
    console.error(`Invalid study input:\n- ${validation.errors.join("\n- ")}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`Title: ${input.title}`);
    console.log(`Description: A 15-minute AI-run interview about ${input.description}`);
    console.log(`Screener questions: ${input.preInterviewQuestions.map((q) => q.id).join(", ")}`);
    console.log(`Custom prompt: ${input.customPrompt.length} characters`);
    console.log(`Voice provider: ${input.voiceProvider ?? "(repository default)"}`);
    console.log(`Report pipeline: ${input.reportPipeline}`);
    console.log("Dry run: nothing was written.");
    return;
  }

  const study = await createStudy(getStudyRepository(), input);
  console.log(`Created study ${study.id}`);
  console.log(`Interview link path: /interview/${study.linkToken}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
