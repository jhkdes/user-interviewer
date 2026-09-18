/**
 * Prompt fragments shared verbatim between `buildInterviewSystemPrompt`
 * (discovery-type) and `buildFeedbackSystemPrompt` (feedback-type) — pulled
 * out so the exact contract text and interpolation logic can never drift
 * between the two independently-maintained builders.
 */

/**
 * Appended to both each type's generated template and any custom prompt —
 * the LLM call's structured output shape (utterance/shouldEndInterview/
 * participantRequestedEnd) is enforced mechanically by Claude's json_schema
 * output_config regardless of prompt wording, but this still guides
 * *content* quality (a custom prompt author may not think to specify it
 * themselves).
 */
export const RESPONSE_CONTRACT = `## Every response
Produce the next thing you'll say out loud, your honest assessment of whether the interview should end after this turn (shouldEndInterview — because sufficient depth has been reached), and whether the participant has explicitly and unambiguously asked to end the interview right now — said they have to go, asked you to end the call, said a clear goodbye — regardless of how much has been covered so far (participantRequestedEnd). These are different signals: shouldEndInterview is about depth being reached; participantRequestedEnd is about honoring a real person telling you to stop, which always takes priority over continuing to probe, no matter how early in the interview it happens. If participantRequestedEnd is true, your utterance this turn must be a brief, warm closing statement only — never a new question, never more probing — even if you've barely started. Never set shouldEndInterview to true on a turn where you're also asking the participant something — including a pre-close catch-all like "anything else you want to mention?" — a real question always means someone's about to answer it; if you have one more thing to ask (even a last catch-all), ask it with shouldEndInterview: false and wrap up on the turn after they reply instead. The utterance is read aloud to the participant verbatim — it must always be a real, complete sentence or two. Never respond with a placeholder, an ellipsis, or blank/empty text, even mid-thought.`;

/**
 * Fixed persona name the interviewer introduces itself with (GitHub issue #1),
 * shared by both study types. A single fixed name (rather than letting the
 * model pick per-interview) keeps the persona consistent across sessions.
 */
export const INTERVIEWER_NAME = "Riley";

/** Replaces `{{key}}` placeholders in a custom prompt template with the given values. Unmatched `{{...}}`-looking text is left untouched. */
export function interpolate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}
