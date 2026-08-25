import Anthropic from "@anthropic-ai/sdk";
import type {
  GenerateInterviewerTurnInput,
  GenerateInterviewerTurnOutput,
  GenerateStudyReportInput,
  GenerateStudyReportOutput,
  GenerateSummaryInput,
  GenerateSummaryOutput,
  InterviewTurn,
  LLMProviderAdapter,
  StudyReportInterviewInput,
} from "./types";
import { interviewerTurnSchema, studyReportSchema, summarySchema } from "./schemas";

const MODEL = "claude-sonnet-4-6";

/**
 * Observed in manual testing: Claude occasionally returns a degenerate
 * utterance like "..." — valid JSON, so parsing succeeds, but there's
 * nothing real to say to the participant. One retry is cheap (and the
 * system-prompt cache_control means the retry is a cache hit) and catches
 * this before it reaches a live call.
 */
const MAX_INTERVIEWER_TURN_ATTEMPTS = 2;

/** True if the utterance is real spoken content, not a placeholder like "..." or blank text. */
function isMeaningfulUtterance(utterance: string): boolean {
  return /[a-zA-Z]/.test(utterance);
}

const SUMMARY_SYSTEM_PROMPT = `You produce a structured summary of a single user-research interview transcript.
Extract:
- painPoints: specific, concrete pain points the participant described (not generic complaints).
- notableQuotes: short verbatim quotes from the participant that best illustrate those pain points.
- takeaways: general takeaways a product manager reviewing this interview should know.
- roleDescription: the participant's role/day-to-day responsibility, in their own words, from their answer to the interviewer's opening question. Null if they never clearly stated one — do not invent or infer a role from context.
Base everything strictly on what the participant actually said — do not infer or invent details.`;

const STUDY_REPORT_SYSTEM_PROMPT = `You produce a cross-participant study report from several individual interview summaries and transcripts within the same research study.
Identify themes/pain points that recur across multiple participants (not one-off mentions).
For each theme, report: the theme itself, how many distinct participants raised it (participantCount), and a few representative verbatim quotes drawn from their transcripts.
Only surface themes that are actually grounded in what participants said.`;

/** Formats a transcript as plain "Interviewer: ..." / "Participant: ..." lines for inclusion in a prompt. */
function formatTranscript(transcript: InterviewTurn[]): string {
  return transcript
    .map(
      (turn) => `${turn.speaker === "interviewer" ? "Interviewer" : "Participant"}: ${turn.text}`,
    )
    .join("\n");
}

function formatStudyReportInterviews(interviews: StudyReportInterviewInput[]): string {
  return interviews
    .map(
      (interview, index) => `--- Interview ${index + 1} (id: ${interview.interviewId}) ---
Summary:
  Pain points: ${interview.summary.painPoints.join("; ") || "(none)"}
  Notable quotes: ${interview.summary.notableQuotes.join("; ") || "(none)"}
  Takeaways: ${interview.summary.takeaways.join("; ") || "(none)"}
Transcript:
${formatTranscript(interview.transcript)}`,
    )
    .join("\n\n");
}

/**
 * Claude's message API requires the first message to have role "user" and
 * rejects an empty messages array. In a voice interview the interviewer
 * (assistant) speaks first, so we prepend a synthetic user turn marking the
 * call's start when the real history is empty or begins with the
 * interviewer — callers (the Interview Agent) don't need to know about this
 * Claude-specific constraint.
 */
function buildInterviewMessages(history: InterviewTurn[]): Anthropic.MessageParam[] {
  const needsLeadingUserTurn = history.length === 0 || history[0].speaker === "interviewer";
  const turns: InterviewTurn[] = needsLeadingUserTurn
    ? [{ speaker: "participant", text: "[The interview session has started.]" }, ...history]
    : history;

  return turns.map((turn, index) => {
    const isLast = index === turns.length - 1;
    const role = turn.speaker === "interviewer" ? "assistant" : "user";
    return {
      role,
      content: isLast
        ? [{ type: "text", text: turn.text, cache_control: { type: "ephemeral" } }]
        : turn.text,
    };
  });
}

function parseStructuredResponse<T>(response: Anthropic.Message, context: string): T {
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`${context}: response contained no text block`);
  }
  try {
    return JSON.parse(textBlock.text) as T;
  } catch (cause) {
    throw new Error(`${context}: failed to parse structured response as JSON`, { cause });
  }
}

export class ClaudeSonnet46Adapter implements LLMProviderAdapter {
  constructor(private readonly client: Anthropic) {}

  async generateInterviewerTurn(
    input: GenerateInterviewerTurnInput,
  ): Promise<GenerateInterviewerTurnOutput> {
    let lastAttempt: GenerateInterviewerTurnOutput | undefined;

    for (let attempt = 1; attempt <= MAX_INTERVIEWER_TURN_ATTEMPTS; attempt++) {
      let response: Anthropic.Message;
      try {
        response = await this.client.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: [
            {
              type: "text",
              text: input.systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: buildInterviewMessages(input.conversationHistory),
          output_config: {
            format: { type: "json_schema", schema: interviewerTurnSchema },
            effort: "low",
          },
        });
      } catch (cause) {
        throw new Error("Failed to generate interviewer turn", { cause });
      }

      lastAttempt = parseStructuredResponse<GenerateInterviewerTurnOutput>(
        response,
        "Failed to generate interviewer turn",
      );

      if (isMeaningfulUtterance(lastAttempt.utterance)) {
        return lastAttempt;
      }
    }

    throw new Error(
      `Failed to generate interviewer turn: model returned a non-substantive utterance after ${MAX_INTERVIEWER_TURN_ATTEMPTS} attempts (${JSON.stringify(lastAttempt?.utterance)})`,
    );
  }

  async generateSummary(input: GenerateSummaryInput): Promise<GenerateSummaryOutput> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: SUMMARY_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Interview transcript:\n\n${formatTranscript(input.transcript)}`,
          },
        ],
        output_config: {
          format: { type: "json_schema", schema: summarySchema },
        },
      });
    } catch (cause) {
      throw new Error("Failed to generate summary", { cause });
    }
    return parseStructuredResponse<GenerateSummaryOutput>(response, "Failed to generate summary");
  }

  async generateStudyReport(input: GenerateStudyReportInput): Promise<GenerateStudyReportOutput> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: STUDY_REPORT_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Interviews in this study:\n\n${formatStudyReportInterviews(input.interviews)}`,
          },
        ],
        output_config: {
          format: { type: "json_schema", schema: studyReportSchema },
        },
      });
    } catch (cause) {
      throw new Error("Failed to generate study report", { cause });
    }
    return parseStructuredResponse<GenerateStudyReportOutput>(
      response,
      "Failed to generate study report",
    );
  }
}
