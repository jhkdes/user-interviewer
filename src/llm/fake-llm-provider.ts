import type {
  GenerateInterviewerTurnInput,
  GenerateInterviewerTurnOutput,
  GenerateStudyReportInput,
  GenerateStudyReportOutput,
  GenerateSummaryInput,
  GenerateSummaryOutput,
  LLMProviderAdapter,
} from "./types";

/**
 * Scriptable LLMProviderAdapter for tests. Queue up canned responses, then
 * assert on `calls` to check what the code under test actually sent.
 * Exported for use by every module that depends on LLMProviderAdapter
 * (Interview Agent, Summary Service, Study Report Service) so their tests
 * never make a real network call.
 */
export class FakeLLMProvider implements LLMProviderAdapter {
  readonly calls: {
    generateInterviewerTurn: GenerateInterviewerTurnInput[];
    generateSummary: GenerateSummaryInput[];
    generateStudyReport: GenerateStudyReportInput[];
  } = {
    generateInterviewerTurn: [],
    generateSummary: [],
    generateStudyReport: [],
  };

  private interviewerTurnQueue: GenerateInterviewerTurnOutput[] = [];
  private summaryResult: GenerateSummaryOutput | null = null;
  private studyReportResult: GenerateStudyReportOutput | null = null;

  /** Queues the responses returned by successive `generateInterviewerTurn` calls, in order. */
  scriptInterviewerTurns(turns: GenerateInterviewerTurnOutput[]): void {
    this.interviewerTurnQueue = [...turns];
  }

  scriptSummary(result: GenerateSummaryOutput): void {
    this.summaryResult = result;
  }

  scriptStudyReport(result: GenerateStudyReportOutput): void {
    this.studyReportResult = result;
  }

  async generateInterviewerTurn(
    input: GenerateInterviewerTurnInput,
  ): Promise<GenerateInterviewerTurnOutput> {
    this.calls.generateInterviewerTurn.push(input);
    const next = this.interviewerTurnQueue.shift();
    if (!next) {
      throw new Error(
        "FakeLLMProvider: no scripted interviewer turn left — call scriptInterviewerTurns() with enough turns for this test",
      );
    }
    return next;
  }

  async generateSummary(input: GenerateSummaryInput): Promise<GenerateSummaryOutput> {
    this.calls.generateSummary.push(input);
    if (!this.summaryResult) {
      throw new Error("FakeLLMProvider: no scripted summary — call scriptSummary() first");
    }
    return this.summaryResult;
  }

  async generateStudyReport(input: GenerateStudyReportInput): Promise<GenerateStudyReportOutput> {
    this.calls.generateStudyReport.push(input);
    if (!this.studyReportResult) {
      throw new Error("FakeLLMProvider: no scripted study report — call scriptStudyReport() first");
    }
    return this.studyReportResult;
  }
}
