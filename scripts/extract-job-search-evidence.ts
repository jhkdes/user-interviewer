/**
 * Runs the evidence extractor over one saved interview, several times, and
 * shows how the runs compare. Used to evaluate extraction quality: whether the
 * quotes are real, whether the runs agree, and how the result lines up with a
 * researcher's hand coding.
 *
 * Input is a JSON file with `transcript` (speaker/text turns) and optional
 * `screenerAnswers`, such as private-fixtures/job-search/real-interview-001.json.
 * Costs real Anthropic API calls (one large call per run). Requires
 * ANTHROPIC_API_KEY. Run with:
 *   npm run extract:job-search -- --input=private-fixtures/job-search/real-interview-001.json --runs=3
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClaudeCompletion } from "../src/job-search-study/extraction/claude-completion";
import { extractEvidence, type ExtractionResult } from "../src/job-search-study/extraction/extract";
import { aggregateRuns } from "../src/job-search-study/ledger/aggregate";
import { renderReview } from "../src/job-search-study/review/render-review";
import { loadRubric } from "../src/job-search-study/rubric/rubric";
import { scoreLedger } from "../src/job-search-study/scoring/score";
import type { InterviewTurn } from "../src/llm/types";

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=")];
    }),
  );
  if (!args["input"]) {
    console.error(
      "Usage: npm run extract:job-search -- --input=<fixture.json> [--runs=3] [--out=<dir>]",
    );
    process.exit(1);
  }
  return {
    input: args["input"],
    runs: Number(args["runs"] ?? 3),
    out: args["out"] ?? path.join(path.dirname(args["input"]), "extractions"),
  };
}

const cell = (vote: { status: string; score: number | null; evidenceBasis: string | null }) => {
  if (vote.status === "rated")
    return `${vote.score}${vote.evidenceBasis ? `(${vote.evidenceBasis[0]})` : ""}`;
  return vote.status === "not_applicable" ? "n/a" : "--";
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY (e.g. run via `npm run extract:job-search`).");
    process.exit(1);
  }

  const { input, runs, out } = parseArgs();
  const fixture = JSON.parse(readFileSync(input, "utf-8")) as {
    transcript: Array<{ speaker: InterviewTurn["speaker"]; text: string }>;
    screenerAnswers?: Record<string, string | string[]> | null;
  };
  const transcript: InterviewTurn[] = fixture.transcript.map(({ speaker, text }) => ({
    speaker,
    text,
  }));

  const rubric = loadRubric();
  const complete = createClaudeCompletion(new Anthropic());
  const results: ExtractionResult[] = [];

  // Sequential on purpose: the first call writes the prompt cache, later calls read it.
  for (let i = 1; i <= runs; i++) {
    process.stdout.write(`run ${i}/${runs}... `);
    const started = Date.now();
    const result = await extractEvidence(
      { complete, rubric },
      { transcript, screenerAnswers: fixture.screenerAnswers ?? null },
    );
    console.log(
      `${((Date.now() - started) / 1000).toFixed(0)}s, attempts=${result.attempts}, ok=${result.ok}, issues=${result.issues.length}`,
    );
    results.push(result);
  }

  mkdirSync(out, { recursive: true });
  const name = path.basename(input, ".json");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  results.forEach((result, i) => {
    writeFileSync(
      path.join(out, `${name}.${stamp}.run${i + 1}.json`),
      JSON.stringify(result, null, 2),
    );
  });

  const usable = results.filter((r) => r.ledger.behaviors.length > 0).map((r) => r.ledger);
  if (usable.length === 0) {
    console.error("No usable ledgers.");
    process.exit(1);
  }
  const aggregate = aggregateRuns(rubric, usable);
  writeFileSync(
    path.join(out, `${name}.${stamp}.aggregate.json`),
    JSON.stringify(aggregate, null, 2),
  );

  const scoring = scoreLedger(rubric, aggregate);
  const reviewPath = path.join(out, `${name}.${stamp}.review.md`);
  writeFileSync(
    reviewPath,
    renderReview({
      title: name,
      rubric,
      aggregate,
      scoring,
      issues: results.flatMap((r) => r.issues),
    }),
  );

  console.log("\nDimensions:");
  for (const d of scoring.dimensions) {
    console.log(
      `  ${d.name.padEnd(7)} ${d.band?.text ?? "Not enough evidence"}${d.score !== null ? ` (${d.score})` : ""}`,
    );
  }

  console.log(
    "\nBehavior                           runs (basis: c=concrete e=estimate g=general s=self)   result",
  );
  for (const behavior of aggregate.behaviors) {
    const spec = rubric.behaviors.find((b) => b.id === behavior.id)!;
    const runsText = behavior.votes.map(cell).join("  ").padEnd(26);
    const result = `${cell({ status: behavior.status, score: behavior.score, evidenceBasis: behavior.evidenceBasis })}${behavior.lowConfidence ? "  LOW CONFIDENCE" : ""}`;
    console.log(`${behavior.id} ${spec.name.padEnd(32)} ${runsText} ${result}`);
  }

  const allIssues = results.flatMap((r, i) => r.issues.map((issue) => ({ run: i + 1, ...issue })));
  if (allIssues.length > 0) {
    console.log("\nIssues:");
    for (const issue of allIssues) {
      console.log(`  run ${issue.run} [${issue.severity}] ${issue.message}`);
    }
  }
  if (aggregate.factDifferences.length > 0) {
    console.log("\nFact differences across runs:");
    for (const difference of aggregate.factDifferences) console.log(`  ${difference}`);
  }

  const base = aggregate.base;
  console.log("\nFacts (run 1):", JSON.stringify(base.facts, null, 2));
  console.log("\nReport priority (run 1):", base.reportPriority);
  console.log("\nConflicts (run 1):", JSON.stringify(base.conflicts, null, 2));
  console.log(`\nSaved to ${out}`);
  console.log(`Review document: ${reviewPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
