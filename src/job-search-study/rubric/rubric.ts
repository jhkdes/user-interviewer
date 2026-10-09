import rubricJson from "./rubric.json";

/**
 * Typed access to the job-search rubric (rubric.json). Everything that needs
 * the dimensions, behaviors, anchors, weights, tiers, caps, or band cutoffs
 * reads them from here, so the extraction prompt and the scoring code can
 * never disagree about the rubric.
 */

export type DimensionId = "focus" | "pitch" | "reach" | "learn";
export type BehaviorId =
  "F1" | "F2" | "F3" | "P1" | "P2" | "P3" | "P4" | "R1" | "R2" | "R3" | "L1" | "L2" | "L3";
export type Tier = "must_have" | "standard" | "opportunistic";
export type EvidenceBasis =
  "concrete_example" | "estimated_pattern" | "general_description" | "self_rating";
export type EvidenceStrength = "strong" | "partial";
export type Score = 0 | 1 | 2 | 3 | 4;

export interface Dimension {
  id: DimensionId;
  name: string;
  question: string;
}

export interface Behavior {
  id: BehaviorId;
  dimension: DimensionId;
  name: string;
  /** Percent weight within its dimension; weights in a dimension sum to 100. */
  weight: number;
  tier: Tier;
  /**
   * Replaces the global cap for particular kinds of evidence on this behavior
   * only. For example, F2 accepts a qualitative answer ("most of them") as
   * fully as a number, so its estimates are not capped.
   */
  evidenceCapOverrides?: Partial<Record<EvidenceBasis, Score>>;
  subSignals: string[];
  anchors: Record<"0" | "1" | "2" | "3" | "4", string>;
  notes: string[];
  /** When this behavior is not applicable to a participant; `null` if it always applies. */
  notApplicable: string | null;
}

export interface EvidenceBasisRule {
  strength: EvidenceStrength;
  /** Highest score this kind of evidence can support. */
  maxScore: Score;
  meaning: string;
}

export interface Band {
  id: string;
  label: string;
  minScore: number;
}

export interface Rubric {
  version: string;
  description: string;
  scale: { min: number; max: number };
  evidenceBases: Record<EvidenceBasis, EvidenceBasisRule>;
  rated: { minRatedWeightShare: number; requireMustHaves: boolean };
  bands: Band[];
  behaviorLabels: Band[];
  dimensions: Dimension[];
  behaviors: Behavior[];
}

const TIERS: Tier[] = ["must_have", "standard", "opportunistic"];
const ANCHOR_KEYS = ["0", "1", "2", "3", "4"] as const;

/** Returns a list of problems with the rubric; empty when it is internally consistent. */
export function validateRubric(rubric: Rubric): string[] {
  const errors: string[] = [];

  if (!/^\d+\.\d+\.\d+$/.test(rubric.version))
    errors.push(`version "${rubric.version}" is not semver`);
  if (rubric.scale.min !== 0 || rubric.scale.max !== 4) errors.push("scale must be 0 to 4");

  const dimensionIds = new Set<string>();
  for (const dimension of rubric.dimensions) {
    if (dimensionIds.has(dimension.id)) errors.push(`duplicate dimension ${dimension.id}`);
    dimensionIds.add(dimension.id);
  }

  const behaviorIds = new Set<string>();
  const weightByDimension = new Map<string, number>();
  for (const behavior of rubric.behaviors) {
    if (behaviorIds.has(behavior.id)) errors.push(`duplicate behavior ${behavior.id}`);
    behaviorIds.add(behavior.id);
    if (!dimensionIds.has(behavior.dimension)) {
      errors.push(`${behavior.id}: unknown dimension ${behavior.dimension}`);
    }
    if (!TIERS.includes(behavior.tier))
      errors.push(`${behavior.id}: invalid tier ${behavior.tier}`);
    if (!(behavior.weight > 0)) errors.push(`${behavior.id}: weight must be positive`);
    if (behavior.subSignals.length === 0) errors.push(`${behavior.id}: no sub-signals`);
    for (const [basis, cap] of Object.entries(behavior.evidenceCapOverrides ?? {})) {
      if (!(basis in rubric.evidenceBases))
        errors.push(`${behavior.id}: override for unknown evidence basis ${basis}`);
      if (!Number.isInteger(cap) || cap < 0 || cap > 4)
        errors.push(`${behavior.id}: override cap for ${basis} out of range`);
    }
    for (const key of ANCHOR_KEYS) {
      if (!behavior.anchors[key]?.trim()) errors.push(`${behavior.id}: missing anchor ${key}`);
    }
    weightByDimension.set(
      behavior.dimension,
      (weightByDimension.get(behavior.dimension) ?? 0) + behavior.weight,
    );
  }

  for (const dimension of rubric.dimensions) {
    const total = weightByDimension.get(dimension.id) ?? 0;
    if (total !== 100)
      errors.push(`${dimension.id}: behavior weights sum to ${total}, expected 100`);

    const hasMustHave = rubric.behaviors.some(
      (behavior) => behavior.dimension === dimension.id && behavior.tier === "must_have",
    );
    if (!hasMustHave) errors.push(`${dimension.id}: no must-have behavior`);
  }

  for (const [name, bands] of [
    ["bands", rubric.bands],
    ["behaviorLabels", rubric.behaviorLabels],
  ] as const) {
    const sorted = bands.every((band, i) => i === 0 || bands[i - 1].minScore > band.minScore);
    if (!sorted) errors.push(`${name} must be listed from highest minScore to lowest`);
    if (bands[bands.length - 1]?.minScore !== 0) errors.push(`${name}: last entry must start at 0`);
  }

  for (const [basis, rule] of Object.entries(rubric.evidenceBases)) {
    if (rule.maxScore < 0 || rule.maxScore > 4) errors.push(`${basis}: maxScore out of range`);
  }

  const share = rubric.rated.minRatedWeightShare;
  if (share <= 0 || share > 1) errors.push("rated.minRatedWeightShare must be in (0, 1]");

  return errors;
}

export function loadRubric(): Rubric {
  const rubric = rubricJson as unknown as Rubric;
  const errors = validateRubric(rubric);
  if (errors.length > 0) {
    throw new Error(`Invalid job-search rubric:\n- ${errors.join("\n- ")}`);
  }
  return rubric;
}

export function getBehavior(rubric: Rubric, id: BehaviorId): Behavior {
  const behavior = rubric.behaviors.find((candidate) => candidate.id === id);
  if (!behavior) throw new Error(`Unknown behavior ${id}`);
  return behavior;
}

export function behaviorsInDimension(rubric: Rubric, dimension: DimensionId): Behavior[] {
  return rubric.behaviors.filter((behavior) => behavior.dimension === dimension);
}

/** The highest score a kind of evidence can support for a behavior: its override if it has one, otherwise the global cap. */
export function evidenceCap(rubric: Rubric, behavior: Behavior, basis: EvidenceBasis): Score {
  return behavior.evidenceCapOverrides?.[basis] ?? rubric.evidenceBases[basis].maxScore;
}
