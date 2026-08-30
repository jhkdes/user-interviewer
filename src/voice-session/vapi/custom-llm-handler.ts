import { generateTurn, type GenerateTurnDeps } from "../generate-turn";
import { MissingInterviewIdError } from "../errors";
import { buildStreamingCompletionBody } from "../openai-response";
import type { VapiCustomLlmChatCompletionRequest } from "./types";

/**
 * Appended to the interviewer's final utterance, and must be configured as
 * an `endCallPhrases` entry on the live Vapi assistant (see PROGRESS.md's M6
 * entry) — Vapi hangs up once the assistant says this exact phrase. We
 * append fixed text ourselves rather than relying on the LLM to phrase a
 * consistent sign-off every time, since exact-phrase matching needs exact
 * text.
 */
export const END_CALL_PHRASE = "This concludes our interview session.";

const INTERVIEW_NOUN = /\b(?:interview|call|session)\b/i;
const ENDING_VERB = /\b(?:concludes?|is (?:over|complete|finished)|has (?:ended|concluded))\b/i;

/**
 * Strips any sentence where the LLM's own closing turn already says the
 * interview is ending/over/concluding, despite system-prompt.ts telling it
 * not to. Left in place, wording like this sits directly adjacent to the
 * appended END_CALL_PHRASE and can merge with it into a garbled, non-matching
 * string — which means Vapi's exact-phrase `endCallPhrases` detection never
 * fires and the call never actually hangs up. Requiring both an interview
 * noun and an ending verb in the same sentence (rather than matching either
 * alone) avoids false positives on unrelated sentences that happen to use
 * one of these common words. Applied unconditionally so the phrase Vapi
 * listens for always reaches it as a single, clean sentence, regardless of
 * what the LLM said.
 */
function stripSelfClosingSentences(utterance: string): string {
  const sentences = utterance.match(/[^.!?]*[.!?]|[^.!?]+$/g) ?? [];
  return sentences
    .filter((sentence) => !(INTERVIEW_NOUN.test(sentence) && ENDING_VERB.test(sentence)))
    .join("")
    .trim();
}

/**
 * Handles one turn of Vapi's custom-LLM integration (T6.2): extracts
 * `interviewId` from the request, delegates to the provider-agnostic
 * generate-turn.ts core, and — since Vapi hangs up on exact-phrase matching
 * rather than a tool call — appends END_CALL_PHRASE once the interview is
 * over, after stripping any self-closing sentence the LLM produced on its
 * own (see stripSelfClosingSentences). Returns the full SSE body Vapi's
 * custom-LLM integration expects back.
 */
export async function handleVapiCustomLlmRequest(
  deps: GenerateTurnDeps,
  request: VapiCustomLlmChatCompletionRequest,
): Promise<string> {
  // Top-level `metadata` is where Vapi sends it by default (metadataSendMode:
  // "variable") — `call.assistantOverrides.metadata` is a defensive fallback
  // in case that mode is ever configured differently. See VapiCallMetadata's
  // doc comment in types.ts.
  const interviewId =
    request.metadata?.interviewId ?? request.call?.assistantOverrides?.metadata?.interviewId;
  if (!interviewId) throw new MissingInterviewIdError("Vapi custom-llm chat completion request");

  const { utterance, isInterviewOver } = await generateTurn(deps, {
    interviewId,
    messages: request.messages,
  });

  const finalUtterance = isInterviewOver
    ? `${stripSelfClosingSentences(utterance)} ${END_CALL_PHRASE}`.trim()
    : utterance;

  return buildStreamingCompletionBody(finalUtterance, request.model);
}
