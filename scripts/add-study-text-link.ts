/**
 * One-off: gives an existing discovery study its text-only participant link
 * (TEXT_DISCOVERY_INTERVIEW.md). Studies created after the text link shipped
 * get one automatically; this is for older ones. Safe to re-run: a study that
 * already has a text link keeps it, and the script just prints it.
 *
 * Needs migration 0024 applied to the Supabase project the env file points at.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/add-study-text-link.ts --study-id=<uuid> [--base-url=https://...]
 */
import { createServerSupabaseClient } from "../src/lib/supabase/client";
import { SupabaseStudyRepository } from "../src/repositories/supabase/supabase-study-repository";
import { addTextLink } from "../src/study-service/add-text-link";

function parseArgs(): { studyId: string; baseUrl: string | null } {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=")];
    }),
  );

  if (!args["study-id"]) {
    console.error(
      "Usage: npx tsx --env-file=.env.local scripts/add-study-text-link.ts --study-id=<uuid> [--base-url=https://...]",
    );
    process.exit(1);
  }

  return { studyId: args["study-id"], baseUrl: args["base-url"] || null };
}

async function main() {
  const { studyId, baseUrl } = parseArgs();
  const repo = new SupabaseStudyRepository(createServerSupabaseClient());

  const before = await repo.getById(studyId);
  const study = await addTextLink(repo, studyId);
  const created = !before?.textLinkToken;

  console.log(
    `${created ? "Created" : "Study already had"} a text link for "${study.title}" (${study.id}).`,
  );
  console.log(`Text link token: ${study.textLinkToken}`);
  if (baseUrl) {
    console.log(`Text link URL:   ${baseUrl.replace(/\/$/, "")}/interview/${study.textLinkToken}`);
    console.log(`Voice link URL:  ${baseUrl.replace(/\/$/, "")}/interview/${study.linkToken}`);
  }
}

main().catch((err) => {
  console.error("Script failed to run:\n", err);
  process.exit(1);
});
