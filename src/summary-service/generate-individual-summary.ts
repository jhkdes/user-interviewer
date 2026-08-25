import type { Summary } from "@/domain";
import type { LLMProviderAdapter } from "@/llm";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { SummaryRepository } from "@/repositories/summary-repository";
import { InterviewNotFoundError, MissingTranscriptError } from "./errors";

export interface GenerateIndividualSummaryDeps {
  interviewRepo: InterviewRepository;
  summaryRepo: SummaryRepository;
  llm: LLMProviderAdapter;
}

/**
 * Turns a completed interview's transcript into a structured individual
 * summary (T7.2): loads the transcript, calls
 * `LLMProviderAdapter.generateSummary`, and persists the result.
 *
 * Not idempotent by design — calling this twice for the same interview
 * creates two `Summary` rows (no "replace existing summary" ticket exists
 * yet). Callers (currently only the Voice Session Orchestrator, once per
 * `end-of-call-report`) are responsible for only calling it once per
 * interview.
 */
export async function generateIndividualSummary(
  deps: GenerateIndividualSummaryDeps,
  interviewId: string,
): Promise<Summary> {
  const interview = await deps.interviewRepo.getById(interviewId);
  if (!interview) throw new InterviewNotFoundError(interviewId);
  if (!interview.transcript || interview.transcript.length === 0) {
    throw new MissingTranscriptError(interviewId);
  }

  const { painPoints, notableQuotes, takeaways, roleDescription } = await deps.llm.generateSummary({
    transcript: interview.transcript.map((entry) => ({
      speaker: entry.speaker,
      text: entry.text,
    })),
  });

  const summary = await deps.summaryRepo.create({ interviewId, painPoints, notableQuotes, takeaways });

  // Only backfill when the LLM found a clearly stated role — never clobber
  // with null (M13 already leaves it null by default, so there's nothing to
  // "clear" here, only a real value worth persisting).
  if (roleDescription) {
    await deps.interviewRepo.update(interviewId, { roleDescription });
  }

  return summary;
}
