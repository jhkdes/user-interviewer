/**
 * Re-scores a saved extraction and writes a fresh review document, without
 * calling the model. Use after changing the rubric (caps, weights, bands) to
 * see the effect on an interview that has already been extracted. Takes the
 * `*.aggregate.json` file that `npm run extract:job-search` writes.
 *   npm run rescore:job-search -- --aggregate=private-fixtures/job-search/extractions/real-interview-001.<stamp>.aggregate.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AggregatedLedger } from "../src/job-search-study/ledger/aggregate";
import { renderReview } from "../src/job-search-study/review/render-review";
import { loadRubric } from "../src/job-search-study/rubric/rubric";
import { scoreLedger } from "../src/job-search-study/scoring/score";

const arg = process.argv.slice(2).find((a) => a.startsWith("--aggregate="));
if (!arg) {
  console.error("Usage: npm run rescore:job-search -- --aggregate=<file.aggregate.json>");
  process.exit(1);
}
const file = arg.slice("--aggregate=".length);

const rubric = loadRubric();
const aggregate = JSON.parse(readFileSync(file, "utf-8")) as AggregatedLedger;
// An extraction is only meaningful under the rubric version that produced it: behavior ids can
// keep their names while their meaning changes. Re-run extraction after a rubric change.
if (aggregate.base.rubricVersion !== rubric.version && !process.argv.includes("--force")) {
  console.error(
    `This extraction used rubric ${aggregate.base.rubricVersion} but the current rubric is ${rubric.version}. Re-run extraction, or pass --force to score it anyway.`,
  );
  process.exit(1);
}
const scoring = scoreLedger(rubric, aggregate);

const outPath = file.replace(/\.aggregate\.json$/, ".rescored.review.md");
writeFileSync(
  outPath,
  renderReview({
    title: path.basename(file).replace(/\.aggregate\.json$/, "") + " (re-scored)",
    rubric,
    aggregate,
    scoring,
    issues: [],
  }),
);

console.log(`Rubric version ${rubric.version}`);
for (const d of scoring.dimensions) {
  console.log(
    `${d.name.padEnd(7)} ${d.band?.text ?? "Not enough evidence"}${d.score !== null ? ` (${d.score})` : ""}`,
  );
}
for (const b of scoring.behaviors) {
  const score =
    b.outcome === "scored"
      ? `${b.score}${b.capped ? ` (extractor ${b.rawScore}, capped)` : ""}`
      : b.outcome;
  console.log(`  ${b.id}  ${score}`);
}
console.log(`\nWrote ${outPath}`);
