import type { StudyReportTheme } from "@/domain";

export interface InterviewTurn {
  speaker: "interviewer" | "participant";
  text: string;
}

export interface GenerateInterviewerTurnInput {
  systemPrompt: string;
  conversationHistory: InterviewTurn[];
}

export interface GenerateInterviewerTurnOutput {
  utterance: string;
  /**
   * The model's own self-assessment that it has surfaced sufficient,
   * concrete pain points and the interview can wrap up. This is a signal,
   * not a command — the Interview Agent (M3) combines it with pure
   * heuristics (minimum depth, the hard 20-minute cap) before actually
   * ending a session.
   */
  shouldEndInterview: boolean;
}

export interface GenerateSummaryInput {
  transcript: InterviewTurn[];
}

export interface GenerateSummaryOutput {
  painPoints: string[];
  notableQuotes: string[];
  takeaways: string[];
  /**
   * A short job title for the participant (e.g. "Product Manager"),
   * distilled from their answer to the interview's opening question (M13
   * dropped this from the intake form — it's asked conversationally
   * instead). `null` if they never clearly stated a role — this must never
   * be invented/inferred.
   */
  roleDescription: string | null;
}

export interface StudyReportInterviewInput {
  interviewId: string;
  transcript: InterviewTurn[];
  /**
   * roleDescription is excluded — it's persisted on `Interview`, not
   * `Summary`, and isn't part of the cross-participant theme extraction this
   * feeds into (see `formatStudyReportInterviews`).
   */
  summary: Omit<GenerateSummaryOutput, "roleDescription">;
}

export interface GenerateStudyReportInput {
  interviews: StudyReportInterviewInput[];
}

export interface GenerateStudyReportOutput {
  themes: StudyReportTheme[];
}

/**
 * The one interface every interviewing-intelligence call site (Interview
 * Agent, Summary Service, Study Report Service) depends on. Concrete
 * providers (Claude, and whatever comes next) live behind this — see
 * `get-llm-provider.ts` for how the active provider is selected via config.
 */
export interface LLMProviderAdapter {
  generateInterviewerTurn(
    input: GenerateInterviewerTurnInput,
  ): Promise<GenerateInterviewerTurnOutput>;
  generateSummary(input: GenerateSummaryInput): Promise<GenerateSummaryOutput>;
  generateStudyReport(input: GenerateStudyReportInput): Promise<GenerateStudyReportOutput>;
}
