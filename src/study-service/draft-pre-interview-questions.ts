import { randomUUID } from "node:crypto";
import type { PreInterviewQuestion } from "@/domain";
import type { LLMProviderAdapter } from "@/llm";

export interface DraftPreInterviewQuestionsDeps {
  llm: LLMProviderAdapter;
}

export interface DraftPreInterviewQuestionsInput {
  title: string;
  description: string;
}

/**
 * Asks the LLM to propose a screener for a study given its title/description
 * (see the "New Study" wizard's "Generate questions" step), assigning each
 * question a stable id here rather than trusting the LLM to invent unique
 * ones. Returns a draft for the PM to edit — nothing is persisted yet.
 */
export async function draftPreInterviewQuestions(
  deps: DraftPreInterviewQuestionsDeps,
  input: DraftPreInterviewQuestionsInput,
): Promise<PreInterviewQuestion[]> {
  const { questions } = await deps.llm.draftPreInterviewQuestions({
    title: input.title,
    description: input.description,
  });

  return questions.map((question) => ({
    id: randomUUID(),
    label: question.label,
    type: question.type,
    options: question.options,
    allowOther: question.allowOther,
  }));
}
