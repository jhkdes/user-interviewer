import type { PreInterviewQuestion, Study, StudyType, VoiceProvider } from "@/domain";
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
  /** Defaults to `"discovery"` if omitted. Chosen once, at creation — never editable afterward. */
  type?: StudyType;
  title: string;
  description: string;
  preInterviewQuestions: PreInterviewQuestion[];
  feedbackQuestions?: string[];
  researchTopic?: string;
  customPrompt?: string;
  voiceProvider?: VoiceProvider;
}

export async function createStudy(repo: StudyRepository, input: CreateStudyInput): Promise<Study> {
  const { valid, errors } = validateStudyInput(input);
  if (!valid) throw new InvalidStudyInputError(errors);

  return repo.create({
    type: input.type,
    title: input.title,
    description: input.description,
    preInterviewQuestions: input.preInterviewQuestions,
    feedbackQuestions: input.feedbackQuestions,
    researchTopic: input.researchTopic,
    customPrompt: input.customPrompt,
    voiceProvider: input.voiceProvider,
    linkToken: generateLinkToken(),
  });
}
