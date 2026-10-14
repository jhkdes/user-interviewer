import type { Interview } from "@/domain";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import { checkLinkValidity, resolveLink, type LinkValidity } from "@/study-service";
import { validateIntake, type IntakeInput } from "./intake-validation";

export class StudyLinkNotFoundError extends Error {
  constructor(linkToken: string) {
    super(`No study found for link token: ${linkToken}`);
    this.name = "StudyLinkNotFoundError";
  }
}

export class StudyLinkInvalidError extends Error {
  constructor(public readonly reason: Exclude<LinkValidity, "valid">) {
    super(`Study link is ${reason}`);
    this.name = "StudyLinkInvalidError";
  }
}

export class InvalidIntakeError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid intake info: ${errors.join(", ")}`);
    this.name = "InvalidIntakeError";
  }
}

export class ConsentRequiredError extends Error {
  constructor() {
    super("Consent is required to start an interview");
    this.name = "ConsentRequiredError";
  }
}

export interface StartInterviewInput extends IntakeInput {
  linkToken: string;
  consentGiven: boolean;
  deviceType?: string;
  screenerAnswers?: Record<string, string | string[]>;
  trackingId?: string;
}

export interface StartInterviewDeps {
  studyRepo: StudyRepository;
  interviewRepo: InterviewRepository;
  /** Whether typed interviews are switched on for this deploy (TEXT_INTERVIEW_MODE_ENABLED). A study's text link is treated as unknown while this is off. */
  textEnabled?: boolean;
  /** Defaults to `new Date()` — overridable so tests can simulate elapsed time deterministically. */
  now?: Date;
}

/**
 * Validates the study link (T4.2) and the intake fields (T5.1), then creates
 * the Interview and records the consent timestamp. Consent is captured as a
 * separate update after create rather than a CreateInterviewInput field, so
 * InterviewRepository's create contract stays untouched.
 */
export async function startInterview(
  deps: StartInterviewDeps,
  input: StartInterviewInput,
): Promise<Interview> {
  const now = deps.now ?? new Date();

  // Either of the study's two links: the voice link, or the text-only link of a
  // discovery study, whose interviews are typed from the start.
  const resolved = await resolveLink(deps.studyRepo, input.linkToken);
  if (!resolved || (resolved.channel === "text" && !deps.textEnabled)) {
    throw new StudyLinkNotFoundError(input.linkToken);
  }
  const { study, channel } = resolved;

  const validity = checkLinkValidity(study, now);
  if (validity !== "valid") throw new StudyLinkInvalidError(validity);

  const { valid, errors } = validateIntake(input);
  if (!valid) throw new InvalidIntakeError(errors);

  if (!input.consentGiven) throw new ConsentRequiredError();

  const interview = await deps.interviewRepo.create({
    studyId: study.id,
    firstName: input.firstName,
    email: input.email,
    deviceType: input.deviceType,
    screenerAnswers: input.screenerAnswers,
    voiceProvider: study.voiceProvider,
    trackingId: input.trackingId,
    mode: channel === "text" ? "text" : "voice",
  });

  return deps.interviewRepo.update(interview.id, { consentGivenAt: now });
}
