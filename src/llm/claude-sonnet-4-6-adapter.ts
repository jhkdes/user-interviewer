import Anthropic from "@anthropic-ai/sdk";
import { isVoiceSessionDebugEnabled } from "@/lib/debug";
import type {
  GenerateInterviewerTurnInput,
  GenerateInterviewerTurnOutput,
  GenerateStudyReportInput,
  GenerateStudyReportOutput,
  GenerateSummaryInput,
  GenerateSummaryOutput,
  InterviewerTurnStreamEvent,
  InterviewTurn,
  LLMProviderAdapter,
  StudyReportInterviewInput,
} from "./types";
import { interviewerTurnSchema, studyReportSchema, summarySchema } from "./schemas";

const MODEL = "claude-sonnet-5";

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

/**
 * Tool the streaming interviewer-turn call uses to report the decision flags
 * separately from the spoken utterance, since a single structured-JSON
 * response (the non-streaming call's approach, `interviewerTurnSchema`)
 * isn't streamable — Claude must finish generating the whole JSON object
 * before any of it can be spoken. This tool lets the utterance stream as
 * plain text while the flags arrive afterward, without blocking speech.
 * `tool_choice` is left at the default (`auto`) rather than forced — forcing
 * it risks suppressing the text block entirely.
 */
const REPORT_TURN_DECISION_TOOL: Anthropic.Tool = {
  name: "report_turn_decision",
  description:
    "Call this exactly once, immediately after you finish saying your utterance as plain " +
    "text (not before, not instead of it), to report whether the interview should end. " +
    "Do not write any text after calling this tool.",
  input_schema: {
    type: "object",
    properties: {
      shouldEndInterview: {
        type: "boolean",
        description:
          "True if sufficient, concrete pain points have been surfaced and the interview should wrap up after this utterance.",
      },
      participantRequestedEnd: {
        type: "boolean",
        description:
          'True if the participant explicitly and unambiguously asked to end the interview right now, or said they have to leave/go (e.g. "I have to go," "can you end this?," "let\'s stop here," a clear goodbye) — regardless of how much depth has been reached so far. Distinct from shouldEndInterview: this overrides the normal minimum-depth requirement and ends the call immediately after this turn. False otherwise, including when they are just answering slowly, going quiet, or the conversation is naturally winding down without an explicit request to stop.',
      },
    },
    required: ["shouldEndInterview", "participantRequestedEnd"],
  },
};

const SUMMARY_SYSTEM_PROMPT = `You produce a structured summary of a single user-research interview transcript.
Extract:
- painPoints: specific, concrete pain points the participant described (not generic complaints).
- notableQuotes: short verbatim quotes from the participant that best illustrate those pain points.
- takeaways: general takeaways a product manager reviewing this interview should know.
- roleDescription: a short job title for the participant (e.g. "Product Manager", "Engineering Manager"), distilled from their answer to the interviewer's opening question — not a verbatim quote and not their day-to-day responsibilities. Null if they never clearly stated a role — do not invent or infer one from context.
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
      // TEMPORARY — turn-latency diagnostics. Remove once resolved.
      const claudeCallStart = Date.now();
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
          // Unlike Sonnet 4.6 (thinking off when the param is omitted), Sonnet
          // 5 runs adaptive thinking by default when `thinking` is omitted —
          // explicitly disabling it here keeps this call's behavior/latency
          // profile identical to before the model swap, isolating whether the
          // new model itself is faster rather than confounding the
          // measurement with newly-enabled thinking.
          thinking: { type: "disabled" },
          output_config: {
            format: { type: "json_schema", schema: interviewerTurnSchema },
            effort: "low",
          },
        });
      } catch (cause) {
        throw new Error("Failed to generate interviewer turn", { cause });
      }
      if (isVoiceSessionDebugEnabled()) {
        console.log(
          `[timing] claude messages.create attempt=${attempt} ms=${Date.now() - claudeCallStart} cacheReadTokens=${response.usage?.cache_read_input_tokens ?? 0} cacheCreationTokens=${response.usage?.cache_creation_input_tokens ?? 0} inputTokens=${response.usage?.input_tokens ?? 0} outputTokens=${response.usage?.output_tokens ?? 0}`,
        );
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

  /**
   * Streaming counterpart to `generateInterviewerTurn`: forwards utterance
   * text live as `text-delta` events the instant Claude generates it (so
   * TTS can start speaking immediately, rather than waiting for the whole
   * response as the non-streaming call requires), and resolves
   * shouldEndInterview/participantRequestedEnd afterward via the
   * `report_turn_decision` tool call rather than structured JSON output
   * (which isn't streamable). Deliberately has no retry-on-degenerate-output
   * safety net (unlike `generateInterviewerTurn`) — by the time a degenerate
   * utterance could be detected, its text has already been streamed and
   * spoken; there is nothing to retry.
   */
  async *generateInterviewerTurnStreaming(
    input: GenerateInterviewerTurnInput,
  ): AsyncGenerator<InterviewerTurnStreamEvent, void, unknown> {
    const streamStart = Date.now();
    const stream = this.client.messages.stream({
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
      thinking: { type: "disabled" },
      tools: [REPORT_TURN_DECISION_TOOL],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { type: "text-delta", text: event.delta.text };
      }
    }

    let finalMessage: Anthropic.Message;
    try {
      finalMessage = await stream.finalMessage();
    } catch (cause) {
      throw new Error("Failed to generate interviewer turn (streaming)", { cause });
    }
    if (isVoiceSessionDebugEnabled()) {
      console.log(
        `[timing] claude messages.stream ms=${Date.now() - streamStart} cacheReadTokens=${finalMessage.usage?.cache_read_input_tokens ?? 0} cacheCreationTokens=${finalMessage.usage?.cache_creation_input_tokens ?? 0} inputTokens=${finalMessage.usage?.input_tokens ?? 0} outputTokens=${finalMessage.usage?.output_tokens ?? 0}`,
      );
    }

    const utterance = finalMessage.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    const toolUse = finalMessage.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === "report_turn_decision",
    );
    // Safe default when Claude never calls the tool at all: never auto-end
    // an interview the model didn't explicitly flag — a missed "end" signal
    // just costs one extra turn, while a spurious forced end would hang up
    // on a live participant mid-conversation.
    const decision = toolUse?.input as
      | { shouldEndInterview?: boolean; participantRequestedEnd?: boolean }
      | undefined;

    yield {
      type: "done",
      utterance,
      shouldEndInterview: decision?.shouldEndInterview ?? false,
      participantRequestedEnd: decision?.participantRequestedEnd ?? false,
    };
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
