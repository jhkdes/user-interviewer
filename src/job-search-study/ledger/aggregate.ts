import {
  evidenceCap,
  type BehaviorId,
  type EvidenceBasis,
  type Rubric,
  type Score,
} from "../rubric/rubric";
import type { BehaviorEvidence, BehaviorStatus, EvidenceLedger } from "./types";

/**
 * Combines several extraction runs of the same interview into one result per
 * behavior, and flags the behaviors where the runs disagree. Disagreement
 * between runs is the confidence signal: when the extractor cannot agree with
 * itself about a behavior, a researcher should look at it.
 */

export interface RunVote {
  status: BehaviorStatus;
  score: Score | null;
  evidenceBasis: EvidenceBasis | null;
}

export interface AggregatedBehavior {
  id: BehaviorId;
  status: BehaviorStatus;
  /** Lower median of the scores from runs that rated the behavior. Null unless rated. */
  score: Score | null;
  /** The most conservative evidence basis among the runs that scored the median. Null unless rated. */
  evidenceBasis: EvidenceBasis | null;
  /** The entry from a run that produced the chosen score (quotes, sub-signals, notes). */
  representative: BehaviorEvidence;
  votes: RunVote[];
  /** Highest minus lowest score among runs that rated it; 0 when fewer than two did. */
  spread: number;
  lowConfidence: boolean;
  lowConfidenceReasons: string[];
}

export interface AggregatedLedger {
  runs: number;
  behaviors: AggregatedBehavior[];
  /** Differences in numeric facts across runs (match rate, counts), for the reviewer. */
  factDifferences: string[];
  /** The first run's ledger, which supplies facts, comparison, report priority, and conflicts. */
  base: EvidenceLedger;
}

/** Spread at or above this many points (on the 0-4 scale) marks a behavior low-confidence. */
export const LOW_CONFIDENCE_SPREAD = 2;

function lowerMedian(sorted: number[]): number {
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function aggregateRuns(rubric: Rubric, ledgers: EvidenceLedger[]): AggregatedLedger {
  if (ledgers.length === 0) throw new Error("aggregateRuns needs at least one ledger");

  const behaviors: AggregatedBehavior[] = rubric.behaviors.map((spec) => {
    const entries = ledgers
      .map((ledger) => ledger.behaviors.find((entry) => entry.id === spec.id))
      .filter((entry): entry is BehaviorEvidence => entry !== undefined);
    const votes: RunVote[] = entries.map((entry) => ({
      status: entry.status,
      score: entry.score,
      evidenceBasis: entry.evidenceBasis,
    }));
    const reasons: string[] = [];

    // Majority status. A tie falls back to the more conservative status.
    const tally = new Map<BehaviorStatus, number>();
    for (const vote of votes) tally.set(vote.status, (tally.get(vote.status) ?? 0) + 1);
    const ranked = [...tally.entries()].sort(
      (a, b) => b[1] - a[1] || conservativeRank(a[0]) - conservativeRank(b[0]),
    );
    const status = ranked[0][0];
    if (tally.size > 1) {
      reasons.push(
        `Runs disagree on status (${[...tally.entries()].map(([s, n]) => `${s} x${n}`).join(", ")})`,
      );
    }

    const ratedEntries = entries.filter(
      (entry) => entry.status === "rated" && entry.score !== null,
    );
    const scores = ratedEntries.map((entry) => entry.score as number).sort((a, b) => a - b);
    const spread = scores.length >= 2 ? scores[scores.length - 1] - scores[0] : 0;
    if (spread >= LOW_CONFIDENCE_SPREAD) {
      reasons.push(`Scores differ by ${spread} across runs (${scores.join(", ")})`);
    }

    let score: Score | null = null;
    let evidenceBasis: EvidenceBasis | null = null;
    let representative = entries[0];

    if (status === "rated" && scores.length > 0) {
      score = lowerMedian(scores) as Score;
      const atMedian = ratedEntries.filter((entry) => entry.score === score);
      const mostConservative = [...atMedian].sort(
        (a, b) =>
          evidenceCap(rubric, spec, a.evidenceBasis ?? "self_rating") -
          evidenceCap(rubric, spec, b.evidenceBasis ?? "self_rating"),
      )[0];
      evidenceBasis = mostConservative.evidenceBasis;
      representative = mostConservative;
    } else {
      representative = entries.find((entry) => entry.status === status) ?? entries[0];
    }

    return {
      id: spec.id,
      status,
      score,
      evidenceBasis,
      representative,
      votes,
      spread,
      lowConfidence: reasons.length > 0,
      lowConfidenceReasons: reasons,
    };
  });

  return {
    runs: ledgers.length,
    behaviors,
    factDifferences: compareFacts(ledgers),
    base: ledgers[0],
  };
}

function conservativeRank(status: BehaviorStatus): number {
  return status === "insufficient_evidence" ? 0 : status === "rated" ? 1 : 2;
}

function compareFacts(ledgers: EvidenceLedger[]): string[] {
  const differences: string[] = [];
  const distinct = (label: string, values: Array<string | number | null>) => {
    const unique = [...new Set(values.map((value) => (value === null ? "none" : String(value))))];
    if (unique.length > 1) differences.push(`${label} differs across runs: ${unique.join(" | ")}`);
  };

  distinct(
    "Match rate",
    ledgers.map((l) => {
      const { matched, outOf } = l.facts.matchRate;
      return matched === null ? null : `${matched} of ${outOf ?? "?"}`;
    }),
  );
  distinct(
    "Total conversations",
    ledgers.map((l) => l.facts.totalConversations),
  );
  distinct(
    "Source counts",
    ledgers.map(
      (l) =>
        l.facts.sources
          .filter((s) => s.count !== null)
          .map((s) => `${s.source}=${s.count}`)
          .sort()
          .join(",") || null,
    ),
  );
  distinct(
    "Typical application minutes",
    ledgers.map((l) => l.comparison.typical?.timeMinutes ?? null),
  );
  distinct(
    "Described application typical?",
    ledgers.map((l) => {
      const value = l.comparison.describedApplicationIsTypical;
      return value === null ? null : String(value);
    }),
  );
  return differences;
}
