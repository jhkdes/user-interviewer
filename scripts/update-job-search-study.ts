/**
 * Brings an existing study up to date with the current job-search config: sets
 * its pre-interview questions to the fixed job-search screener (JOB_SEARCH_SCREENER)
 * and its interviewer prompt to the one in JOB_SEARCH_INTERVIEWER_PROMPT.md.
 *
 * Study.customPrompt has no update endpoint, so this talks to the database named
 * by SUPABASE_URL (preview and production share one) through the repository.
 * Before changing anything it saves the study's current questions and prompt to
 * private-fixtures/study-backups/ (git-ignored), so the change can be undone.
 *
 * What it does not touch: the study's report pipeline (fixed at creation), its
 * title, description, voice provider, link, or existing interviews. Existing
 * interviews keep their stored screener answers, but answers keyed by question
 * ids that are no longer on the study show their raw id in exports.
 *
 * Run without --apply first to see the plan:
 *   npx tsx --env-file=.env.local scripts/update-job-search-study.ts --study-id=<id>
 *   npx tsx --env-file=.env.local scripts/update-job-search-study.ts --study-id=<id> --apply
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";
import { loadJobSearchInterviewerPrompt } from "../src/job-search-study/interviewer-prompt";
import { JOB_SEARCH_SCREENER } from "../src/job-search-study/study-config";
import { getStudyRepository } from "../src/repositories/get-study-repository";

async function main() {
  const idArg = process.argv.find((arg) => arg.startsWith("--study-id="));
  const apply = process.argv.includes("--apply");
  if (!idArg) {
    console.error("Usage: update-job-search-study.ts --study-id=<id> [--apply]");
    process.exit(1);
  }
  const studyId = idArg.slice("--study-id=".length);

  const repo = getStudyRepository();
  const study = await repo.getById(studyId);
  if (!study) {
    console.error(`No study found with id ${studyId}`);
    process.exit(1);
  }
  if (study.type !== "discovery") {
    console.error(
      `Study ${studyId} is a ${study.type} study; only discovery studies can be updated.`,
    );
    process.exit(1);
  }

  const prompt = loadJobSearchInterviewerPrompt();
  const have = study.preInterviewQuestions.map((q) => q.id);
  const want = JOB_SEARCH_SCREENER.map((q) => q.id);

  console.log(`Study: ${study.title} (${study.id})`);
  console.log(`Report pipeline: ${study.reportPipeline ?? "none"} (not changed by this script)`);
  console.log(`Questions now (${have.length}): ${have.join(", ")}`);
  console.log(`Questions after (${want.length}): ${want.join(", ")}`);
  console.log(`Prompt: ${study.customPrompt?.length ?? 0} -> ${prompt.length} characters`);
  console.log(
    `Prompt already current: ${study.customPrompt === prompt} | questions already current: ${isDeepStrictEqual(study.preInterviewQuestions, JOB_SEARCH_SCREENER)}`,
  );

  if (!apply) {
    console.log("\nDry run: nothing was changed. Add --apply to update the study.");
    return;
  }

  const backupDir = path.resolve(process.cwd(), "private-fixtures", "study-backups");
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `${study.id}-${stamp}.json`);
  writeFileSync(
    backupFile,
    JSON.stringify(
      {
        studyId: study.id,
        preInterviewQuestions: study.preInterviewQuestions,
        customPrompt: study.customPrompt,
      },
      null,
      2,
    ),
  );
  console.log(`\nBackup saved: ${backupFile}`);

  const updated = await repo.updateDetails(study.id, {
    preInterviewQuestions: JOB_SEARCH_SCREENER,
    customPrompt: prompt,
  });
  console.log(
    `Updated: ${updated.preInterviewQuestions.length} questions, prompt ${updated.customPrompt?.length} characters.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
