/**
 * Generates the participant report for one saved extraction: scores and tables
 * from code, prose from one model call, rendered to a self-contained HTML page.
 * Takes the `*.aggregate.json` that `npm run extract:job-search` writes and the
 * interview fixture (for the screener answers). One real API call.
 *   npm run report:job-search -- --aggregate=<file.aggregate.json> --input=<fixture.json>
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";
import { createClaudeCompletion } from "../src/job-search-study/extraction/claude-completion";
import type { AggregatedLedger } from "../src/job-search-study/ledger/aggregate";
import { generateReport } from "../src/job-search-study/report/generate";
import { renderReportHtml } from "../src/job-search-study/report/render-html";
import { loadRubric } from "../src/job-search-study/rubric/rubric";

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=")];
    }),
  );
  if (!args["aggregate"]) {
    console.error(
      "Usage: npm run report:job-search -- --aggregate=<file.aggregate.json> [--input=<fixture.json>]",
    );
    process.exit(1);
  }
  return { aggregate: args["aggregate"], input: args["input"] };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY (e.g. run via `npm run report:job-search`).");
    process.exit(1);
  }

  const { aggregate: aggregatePath, input } = parseArgs();
  const rubric = loadRubric();
  const aggregate = JSON.parse(readFileSync(aggregatePath, "utf-8")) as AggregatedLedger;
  const screenerAnswers = input
    ? ((
        JSON.parse(readFileSync(input, "utf-8")) as {
          screenerAnswers?: Record<string, string | string[]>;
        }
      ).screenerAnswers ?? null)
    : null;

  // An extraction is only meaningful under the rubric version that produced it: behavior ids can
  // keep their names while their meaning changes. Re-run extraction after a rubric change.
  if (aggregate.base.rubricVersion !== rubric.version && !process.argv.includes("--force")) {
    console.error(
      `This extraction used rubric ${aggregate.base.rubricVersion} but the current rubric is ${rubric.version}. Re-run extraction, or pass --force to score it anyway.`,
    );
    process.exit(1);
  }

  const complete = createClaudeCompletion(new Anthropic());
  const started = Date.now();
  const result = await generateReport({ complete }, { rubric, aggregate, screenerAnswers });
  console.log(
    `Narrative: ${((Date.now() - started) / 1000).toFixed(0)}s, attempts=${result.narrativeAttempts}, violations=${result.narrativeViolations.length}`,
  );
  for (const violation of result.narrativeViolations) console.log(`  VIOLATION: ${violation}`);
  for (const violation of result.textViolations) console.log(`  TEXT VIOLATION: ${violation}`);

  const base = aggregatePath.replace(/\.aggregate\.json$/, "");
  writeFileSync(`${base}.report.html`, renderReportHtml(result.report));
  writeFileSync(
    `${base}.report.json`,
    JSON.stringify(
      {
        report: result.report,
        pack: result.pack,
        comparison: result.comparison,
        narrativeViolations: result.narrativeViolations,
        textViolations: result.textViolations,
      },
      null,
      2,
    ),
  );

  console.log("\nBands:");
  for (const d of result.report.dimensions)
    console.log(`  ${d.name.padEnd(6)} ${d.band ?? "Not enough to rate"}`);
  console.log("\nExperiments picked:");
  for (const e of result.report.experiments)
    console.log(`  ${e.forBehavior}  ${e.title}  [${e.reason}]`);
  console.log(`\nWrote ${base}.report.html`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
