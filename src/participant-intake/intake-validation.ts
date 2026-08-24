const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IntakeInput {
  firstName: string;
  email: string;
}

export interface IntakeValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Per REQUIREMENTS.md: first name and email — no accounts, so this is the
 * only gate on what gets stored. Role/responsibility (M13) is no longer
 * collected here; the interviewer asks for it conversationally instead.
 */
export function validateIntake(input: IntakeInput): IntakeValidationResult {
  const errors: string[] = [];

  if (!input.firstName?.trim()) errors.push("firstName is required");
  if (!input.email?.trim()) {
    errors.push("email is required");
  } else if (!EMAIL_PATTERN.test(input.email.trim())) {
    errors.push("email is not a valid email address");
  }

  return { valid: errors.length === 0, errors };
}
