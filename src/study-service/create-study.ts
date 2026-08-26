import type { Study, TargetProfile } from "@/domain";
import type { StudyRepository } from "@/repositories/study-repository";
import { generateLinkToken } from "./link-token";
import { validateTargetProfile } from "./target-profile-validation";

export class InvalidTargetProfileError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid target profile: ${errors.join(", ")}`);
    this.name = "InvalidTargetProfileError";
  }
}

export interface CreateStudyInput {
  targetProfile: TargetProfile;
  researchTopic?: string;
  customPrompt?: string;
}

export async function createStudy(repo: StudyRepository, input: CreateStudyInput): Promise<Study> {
  const { valid, errors } = validateTargetProfile(input.targetProfile);
  if (!valid) throw new InvalidTargetProfileError(errors);

  return repo.create({
    targetProfile: input.targetProfile,
    researchTopic: input.researchTopic,
    customPrompt: input.customPrompt,
    linkToken: generateLinkToken(),
  });
}
