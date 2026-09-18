import type { PreInterviewQuestion, Study, VoiceProvider } from "@/domain";
import type { StudyRepository } from "@/repositories/study-repository";
import { generateLinkToken } from "./link-token";
import { validateStudyInput } from "./study-input-validation";

export class InvalidStudyInputError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid study input: ${errors.join(", ")}`);
    this.name = "InvalidStudyInputError";
  }
}

export interface CreateStudyInput {
  title: string;
  description: string;
  preInterviewQuestions: PreInterviewQuestion[];
  researchTopic?: string;
  customPrompt?: string;
  voiceProvider?: VoiceProvider;
}

export async function createStudy(repo: StudyRepository, input: CreateStudyInput): Promise<Study> {
  const { valid, errors } = validateStudyInput(input);
  if (!valid) throw new InvalidStudyInputError(errors);

  return repo.create({
    title: input.title,
    description: input.description,
    preInterviewQuestions: input.preInterviewQuestions,
    researchTopic: input.researchTopic,
    customPrompt: input.customPrompt,
    voiceProvider: input.voiceProvider,
    linkToken: generateLinkToken(),
  });
}
