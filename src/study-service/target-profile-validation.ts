import type { TargetProfile } from "@/domain";

const REQUIRED_FIELDS: (keyof TargetProfile)[] = [
  "industry",
  "yearsOfExperience",
  "jobTitle",
  "seniority",
  "responsibility",
];

export interface TargetProfileValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Every field is required plain text (see TargetProfile) — this only checks
 * presence, not content, since the PM describes the target profile in their
 * own words rather than picking from an enum.
 */
export function validateTargetProfile(profile: TargetProfile): TargetProfileValidationResult {
  const errors = REQUIRED_FIELDS.filter((field) => !profile[field]?.trim()).map(
    (field) => `${field} is required`,
  );
  return { valid: errors.length === 0, errors };
}
