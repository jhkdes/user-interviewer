import type { AggregatedBehavior, AggregatedLedger } from "../ledger/aggregate";
import {
  evidenceCap,
  type BehaviorId,
  type DimensionId,
  type Rubric,
  type Score,
} from "../rubric/rubric";

/**
 * Turns the aggregated ledger into scores and bands, using only rules from the
 * rubric config: evidence caps, the rule for when a dimension can be rated,
 * weight renormalization, band cutoffs, and the strength / improvement picks.
 * Pure code: given the same ledger it always returns the same result, so it
 * can be unit tested and re-run whenever the rubric changes.
 */

export type BehaviorOutcome = "scored" | "insufficient_evidence" | "not_applicable";

export interface ScoredBehavior {
  id: BehaviorId;
  dimension: DimensionId;
  outcome: BehaviorOutcome;
  /** The anchor the extractor chose (lower median across runs). Null unless scored. */
  rawScore: Score | null;
  /** After the evidence cap. Null unless scored. */
  score: Score | null;
  capped: boolean;
  /** The highest score the evidence supports; null unless scored. */
  cap: Score | null;
  /** Label shown to the participant: from the capped score. Null unless scored. */
  label: { id: string; text: string } | null;
  lowConfidence: boolean;
  lowConfidenceReasons: string[];
}

export type DimensionStatus = "rated" | "not_rated";

export interface ScoredDimension {
  id: DimensionId;
  name: string;
  status: DimensionStatus;
  /** 0-100, renormalized over the behaviors that were scored. Null when not rated. */
  score: number | null;
  band: { id: string; text: string } | null;
  /** Why the dimension could not be rated. Null when rated. */
  notRatedReason: string | null;
  /** Share of the dimension's weight that was scored, 0 to 1. */
  evidencedWeightShare: number;
  /** The best-scoring behavior (3 or more) to show as "doing well". */
  strength: BehaviorId | null;
  /** The lowest-scoring behavior (2 or less) to show as "worth improving". */
  improvement: BehaviorId | null;
  /** True when any behavior in the dimension is low confidence. */
  hasLowConfidenceBehavior: boolean;
  /** True when the score is within a few points of a band cutoff, so a one-point change in one behavior could move the band. */
  nearBandBoundary: boolean;
}

/** How close to a cutoff counts as near it, in dimension-score points (0-100). */
export const NEAR_BOUNDARY_POINTS = 5;

export interface ScoringResult {
  rubricVersion: string;
  behaviors: ScoredBehavior[];
  dimensions: ScoredDimension[];
}

function labelFor(rubric: Rubric, score: number) {
  const label = rubric.behaviorLabels.find((candidate) => score >= candidate.minScore)!;
  return { id: label.id, text: label.label };
}

function bandFor(rubric: Rubric, score: number) {
  const band = rubric.bands.find((candidate) => score >= candidate.minScore)!;
  return { id: band.id, text: band.label };
}

function scoreBehavior(rubric: Rubric, aggregated: AggregatedBehavior): ScoredBehavior {
  const spec = rubric.behaviors.find((behavior) => behavior.id === aggregated.id)!;
  const base = {
    id: spec.id,
    dimension: spec.dimension,
    lowConfidence: aggregated.lowConfidence,
    lowConfidenceReasons: aggregated.lowConfidenceReasons,
  };

  if (
    aggregated.status !== "rated" ||
    aggregated.score === null ||
    aggregated.evidenceBasis === null
  ) {
    return {
      ...base,
      outcome: aggregated.status === "not_applicable" ? "not_applicable" : "insufficient_evidence",
      rawScore: null,
      score: null,
      capped: false,
      cap: null,
      label: null,
    };
  }

  const cap = evidenceCap(rubric, spec, aggregated.evidenceBasis);
  const score = Math.min(aggregated.score, cap) as Score;
  return {
    ...base,
    outcome: "scored",
    rawScore: aggregated.score,
    score,
    capped: score < aggregated.score,
    cap,
    label: labelFor(rubric, score),
  };
}

export function scoreLedger(rubric: Rubric, aggregated: AggregatedLedger): ScoringResult {
  const behaviors = rubric.behaviors.map((spec) => {
    const entry = aggregated.behaviors.find((candidate) => candidate.id === spec.id);
    if (!entry) throw new Error(`Aggregated ledger has no entry for ${spec.id}`);
    return scoreBehavior(rubric, entry);
  });

  const dimensions: ScoredDimension[] = rubric.dimensions.map((dimension) => {
    const specs = rubric.behaviors.filter((behavior) => behavior.dimension === dimension.id);
    const scored = behaviors.filter((b) => b.dimension === dimension.id);

    // Not-applicable behaviors leave the dimension entirely (their weight is not counted either way).
    const applicable = specs.filter(
      (spec) => scored.find((b) => b.id === spec.id)!.outcome !== "not_applicable",
    );
    const totalWeight = applicable.reduce((sum, spec) => sum + spec.weight, 0);
    const ratedSpecs = applicable.filter(
      (spec) => scored.find((b) => b.id === spec.id)!.outcome === "scored",
    );
    const ratedWeight = ratedSpecs.reduce((sum, spec) => sum + spec.weight, 0);
    const share = totalWeight === 0 ? 0 : ratedWeight / totalWeight;

    const missingMustHaves = applicable
      .filter((spec) => spec.tier === "must_have")
      .filter((spec) => scored.find((b) => b.id === spec.id)!.outcome !== "scored");

    let notRatedReason: string | null = null;
    if (share < rubric.rated.minRatedWeightShare) {
      notRatedReason = `Only ${Math.round(share * 100)}% of the weight has evidence (needs ${Math.round(rubric.rated.minRatedWeightShare * 100)}%)`;
    } else if (rubric.rated.requireMustHaves && missingMustHaves.length > 0) {
      notRatedReason = `No evidence for must-have behavior ${missingMustHaves.map((spec) => spec.id).join(", ")}`;
    }

    const base = {
      id: dimension.id,
      name: dimension.name,
      evidencedWeightShare: share,
      hasLowConfidenceBehavior: scored.some((b) => b.lowConfidence),
      nearBandBoundary: false,
    };

    if (notRatedReason !== null) {
      return {
        ...base,
        status: "not_rated" as const,
        score: null,
        band: null,
        notRatedReason,
        strength: null,
        improvement: null,
      };
    }

    const weighted = ratedSpecs.reduce((sum, spec) => {
      const behavior = scored.find((b) => b.id === spec.id)!;
      return sum + ((behavior.score as number) / 4) * spec.weight;
    }, 0);
    const score = Math.round((weighted / ratedWeight) * 1000) / 10;

    const byScoreThenWeight = (a: ScoredBehavior, b: ScoredBehavior) => {
      const weightOf = (id: BehaviorId) => specs.find((spec) => spec.id === id)!.weight;
      return (b.score as number) - (a.score as number) || weightOf(b.id) - weightOf(a.id);
    };
    const ratedBehaviors = scored.filter((b) => b.outcome === "scored");
    const strength = [...ratedBehaviors]
      .sort(byScoreThenWeight)
      .find((b) => (b.score as number) >= 3);
    // The weakest behavior; among ties, the one with the most weight in the dimension.
    const weakestFirst = (a: ScoredBehavior, b: ScoredBehavior) => {
      const weightOf = (id: BehaviorId) => specs.find((spec) => spec.id === id)!.weight;
      return (a.score as number) - (b.score as number) || weightOf(b.id) - weightOf(a.id);
    };
    const improvement = [...ratedBehaviors]
      .sort(weakestFirst)
      .find((b) => (b.score as number) <= 2);

    return {
      ...base,
      status: "rated" as const,
      score,
      band: bandFor(rubric, score),
      notRatedReason: null,
      strength: strength?.id ?? null,
      improvement: improvement?.id ?? null,
      nearBandBoundary: rubric.bands
        .map((b) => b.minScore)
        .filter((cutoff) => cutoff > 0)
        .some((cutoff) => Math.abs(score - cutoff) <= NEAR_BOUNDARY_POINTS),
    };
  });

  return { rubricVersion: rubric.version, behaviors, dimensions };
}
