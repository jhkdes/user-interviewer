import type {
  PreInterviewQuestion,
  ReportPipeline,
  Study,
  StudyType,
  VoiceProvider,
} from "@/domain";
import type { StudyRepository } from "@/repositories/study-repository";
import { JOB_SEARCH_SCREENER } from "@/job-search-study/study-config";
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
  reportPipeline?: ReportPipeline;
  voiceProvider?: VoiceProvider;
}

export async function createStudy(
  repo: StudyRepository,
  rawInput: CreateStudyInput,
): Promise<Study> {
  // The job-search report reads screener answers by fixed question id, so that
  // pipeline always uses its own screener, whatever questions were submitted.
  const input =
    rawInput.reportPipeline === "job-search" && (rawInput.type ?? "discovery") === "discovery"
      ? { ...rawInput, preInterviewQuestions: JOB_SEARCH_SCREENER }
      : rawInput;
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
    reportPipeline: input.reportPipeline,
    voiceProvider: input.voiceProvider,
    linkToken: generateLinkToken(),
  });
}
