import Anthropic from "@anthropic-ai/sdk";
import type { StructuredCompletion } from "./extract";

/** Same model the rest of the app uses; override with EXTRACTION_MODEL while evaluating alternatives. */
export const DEFAULT_EXTRACTION_MODEL = "claude-sonnet-5";

export interface ClaudeCompletionOptions {
  model?: string;
  /** Sent only when provided; leave unset to use the model's default sampling. */
  temperature?: number;
}

const DEFAULT_TOOL_NAME = "record_evidence";

/**
 * A StructuredCompletion backed by a forced tool call. Claude's strict
 * structured outputs (`output_config` with a JSON schema) reject this schema
 * as "too large to compile", so the model is instead forced to call a single
 * tool whose input schema is the ledger schema. That guides the output shape
 * without the strict grammar; deviations are caught by `validateLedger`.
 *
 * The system prompt (the full rubric) is marked cacheable, so repeated runs
 * over the same rubric, and runs over many transcripts, reuse it instead of
 * paying for it every time.
 */
export function createClaudeCompletion(
  client: Anthropic,
  options: ClaudeCompletionOptions = {},
): StructuredCompletion {
  const model = options.model ?? process.env.EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL;
  const envTemperature = process.env.EXTRACTION_TEMPERATURE;
  const temperature =
    options.temperature ??
    (envTemperature !== undefined && envTemperature !== "" ? Number(envTemperature) : undefined);

  return async ({ system, user, schema, maxTokens, toolName = DEFAULT_TOOL_NAME }) => {
    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        // Adaptive thinking would spend the output budget before the JSON
        // starts and risk truncating it; same reasoning as the summary calls.
        thinking: { type: "disabled" },
        ...(temperature !== undefined ? { temperature } : {}),
        messages: [{ role: "user", content: user }],
        tools: [
          {
            name: toolName,
            description: "Record the structured result.",
            input_schema: schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: toolName },
      });
    } catch (cause) {
      throw new Error("Structured completion request failed", { cause });
    }

    if (response.stop_reason === "max_tokens") {
      throw new Error("The response was cut off (max_tokens); the output is incomplete");
    }
    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === toolName,
    );
    if (!toolUse) throw new Error(`The model did not call the ${toolName} tool`);
    return toolUse.input;
  };
}
