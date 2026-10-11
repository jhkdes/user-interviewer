import type { AggregatedLedger } from "../ledger/aggregate";
import type { ApplicationProfile } from "../ledger/types";
import type { LedgerIssue } from "../ledger/validate";
import type { Rubric } from "../rubric/rubric";
import type { ScoredBehavior, ScoringResult } from "../scoring/score";

/**
 * Renders one interview's extraction and scoring as a markdown document for a
 * researcher to read and correct: every score with the evidence type, the
 * runs it came from, the notes the extractor made, and the verified quotes.
 * Not participant-facing.
 */

const SCORE_CELL = (b: ScoredBehavior): string => {
  if (b.outcome === "insufficient_evidence") return "no evidence";
  if (b.outcome === "not_applicable") return "n/a";
  return b.capped ? `${b.score} (extractor said ${b.rawScore}, capped)` : String(b.score);
};

function profileLines(
  title: string,
  profile: ApplicationProfile | null,
  furthestOnly = false,
): string[] {
  if (!profile) return [`**${title}:** none described`, ""];
  const rows: Array<[string, string | number | null]> = [
    ["Source", profile.source],
    ["Fit", profile.fit],
    ["Time (minutes)", profile.timeMinutes],
    ["Time, in their words", profile.timeNote],
    ["How old the posting was when they applied", profile.postingAge],
    ["Research before applying", profile.research],
    ["Positioning", profile.positioning],
    ["Human contact", profile.humanContact],
    ["AI use", profile.aiUse],
    ["Follow-up after submitting", profile.followUp],
  ];
  return [
    `**${title}${furthestOnly ? " (furthest progress only; no interview yet)" : ""}:** ${profile.description}`,
    "",
    ...rows
      .filter(([, value]) => value !== null && value !== "")
      .map(([label, value]) => `- ${label}: ${value}`),
    "",
  ];
}

export function renderReview(input: {
  title: string;
  rubric: Rubric;
  aggregate: AggregatedLedger;
  scoring: ScoringResult;
  issues: LedgerIssue[];
}): string {
  const { rubric, aggregate, scoring, issues } = input;
  const lines: string[] = [];
  const specOf = (id: string) => rubric.behaviors.find((b) => b.id === id)!;
  const nameOf = (id: string | null) => (id ? `${id} ${specOf(id).name}` : "none");

  lines.push(
    `# Extraction review: ${input.title}`,
    "",
    `Rubric version ${scoring.rubricVersion}. ${aggregate.runs} extraction run${aggregate.runs === 1 ? "" : "s"}; each score is the lower median across runs. This is a working document for a researcher to check and correct. It is not shown to participants.`,
    "",
    "## Dimensions",
    "",
    "| Dimension | Band | Score | Doing well | Worth improving | Notes |",
    "|---|---|---:|---|---|---|",
  );
  for (const d of scoring.dimensions) {
    const notes = [
      d.status === "not_rated" ? `Not rated: ${d.notRatedReason}` : null,
      d.hasLowConfidenceBehavior ? "has a low-confidence behavior" : null,
      d.nearBandBoundary ? "score is near a band cutoff; one behavior could move the band" : null,
    ]
      .filter(Boolean)
      .join("; ");
    lines.push(
      `| ${d.name} | ${d.band?.text ?? "Not enough evidence"} | ${d.score ?? "-"} | ${d.strength ? nameOf(d.strength) : "-"} | ${d.improvement ? nameOf(d.improvement) : "-"} | ${notes || "-"} |`,
    );
  }

  lines.push(
    "",
    "## Behaviors",
    "",
    "| | Behavior | Score (0-4) | Label | Evidence type | Runs | Confidence |",
    "|---|---|---|---|---|---|---|",
  );
  for (const b of scoring.behaviors) {
    const agg = aggregate.behaviors.find((a) => a.id === b.id)!;
    const runs = agg.votes
      .map((v) =>
        v.status === "rated" ? String(v.score) : v.status === "not_applicable" ? "n/a" : "-",
      )
      .join(", ");
    lines.push(
      `| ${b.id} | ${specOf(b.id).name} | ${SCORE_CELL(b)} | ${b.label?.text ?? "-"} | ${agg.evidenceBasis ?? "-"} | ${runs} | ${b.lowConfidence ? "LOW: " + b.lowConfidenceReasons.join("; ") : "ok"} |`,
    );
  }

  lines.push("", "## Evidence by behavior", "");
  for (const b of scoring.behaviors) {
    const spec = specOf(b.id);
    const agg = aggregate.behaviors.find((a) => a.id === b.id)!;
    const entry = agg.representative;
    lines.push(`### ${b.id}. ${spec.name}`, "");
    if (b.outcome === "scored") {
      lines.push(
        `**Score ${b.score} (${b.label!.text})** on ${agg.evidenceBasis} evidence. Anchor ${b.score}: ${spec.anchors[String(b.score) as "0"]}`,
        "",
      );
      if (b.capped)
        lines.push(`The extractor chose ${b.rawScore}; the evidence type caps it at ${b.cap}.`, "");
    } else {
      lines.push(
        `**${b.outcome === "not_applicable" ? "Not applicable" : "No evidence"}.** ${entry.statusReason ?? ""}`,
        "",
      );
    }
    if (entry.subSignals.length > 0) {
      lines.push(
        "What the extractor noted:",
        ...entry.subSignals.map((s) => `- ${s.name}: ${s.observation}`),
        "",
      );
    }
    if (entry.quotes.length > 0) {
      lines.push(
        "Quotes (verified against the transcript):",
        ...entry.quotes.map((q) => `- [turn ${q.turnIndex}] "${q.text}"`),
        "",
      );
    }
    if (entry.confidenceNote) lines.push(`Confidence note: ${entry.confidenceNote}`, "");
    if (entry.trajectoryNote) lines.push(`Trajectory: ${entry.trajectoryNote}`, "");
  }

  const { facts, comparison, reportPriority, conflicts } = aggregate.base;
  lines.push("## Facts (from the first run)", "");
  lines.push(`- Target: ${facts.targetSummary ?? "not captured"}`);
  lines.push(
    `- Match rate: ${facts.matchRate.matched === null ? "no number given" : `${facts.matchRate.matched} of ${facts.matchRate.outOf ?? "?"}`}`,
  );
  lines.push(
    `- Support providers named: ${facts.supportProviders.length === 0 ? "none" : facts.supportProviders.join("; ")}`,
  );
  lines.push(`- Total conversations or interviews: ${facts.totalConversations ?? "not stated"}`);
  lines.push(
    `- Sources: ${facts.sources.length === 0 ? "none captured" : facts.sources.map((s) => `${s.source} ${s.count ?? "?"}`).join(", ")}`,
  );
  lines.push(
    `- Effort: ${facts.effortSplit.length === 0 ? "none captured" : facts.effortSplit.map((s) => `${s.source} ${s.sharePercent !== null ? s.sharePercent + "%" : (s.qualitative ?? "?")}`).join("; ")}`,
  );
  if (facts.volunteeredContext.length > 0) {
    lines.push(
      "- Volunteered context (never scored):",
      ...facts.volunteeredContext.map((c) => `  - ${c}`),
    );
  }

  lines.push("", "## Typical versus successful application (from the first run)", "");
  lines.push(...profileLines("Typical", comparison.typical));
  lines.push(
    ...profileLines(
      "Successful",
      comparison.successful,
      comparison.successfulIsFurthestProgressOnly,
    ),
  );
  lines.push(
    `Described application typical of how they apply: ${comparison.describedApplicationIsTypical === null ? "unclear" : comparison.describedApplicationIsTypical ? "yes" : "no"}`,
    "",
    `What they said was different: ${comparison.participantExplanation ?? "not captured"}`,
    "",
  );

  lines.push(
    "## Report priority",
    "",
    reportPriority ? `"${reportPriority.text}" (turn ${reportPriority.turnIndex})` : "Not captured",
    "",
  );

  lines.push("## Conflicts and uncertainty", "");
  if (conflicts.length === 0) lines.push("None noted.", "");
  for (const c of conflicts) lines.push(`- ${c.description} (turns ${c.turnIndexes.join(", ")})`);
  if (aggregate.factDifferences.length > 0) {
    lines.push(
      "",
      "Facts that differed between runs:",
      ...aggregate.factDifferences.map((d) => `- ${d}`),
    );
  }

  const warnings = issues.filter((i) => i.severity === "warning");
  if (warnings.length > 0) {
    lines.push("", "## Validation warnings", "", ...warnings.map((w) => `- ${w.message}`));
  }
  lines.push("");
  return lines.join("\n");
}
