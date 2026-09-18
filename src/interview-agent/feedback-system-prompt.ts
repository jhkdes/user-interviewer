import { INTERVIEWER_NAME, RESPONSE_CONTRACT, interpolate } from "./shared-prompt-parts";
import { FEEDBACK_TARGET_MINUTES } from "./termination";

export interface FeedbackPromptContext {
  participantFirstName: string;
  /** Study.title — e.g. "Q3 Product Update Webinar Feedback". */
  studyTitle: string;
  /** Study.description — a noun phrase, same convention as discovery-type studies (see system-prompt.ts). */
  studyDescription: string;
  /** Study.feedbackQuestions — a priority list, not a rigid script; see the guidance block below on how the interviewer should actually use it. */
  feedbackQuestions: string[];
  /**
   * Optional full raw override of the system prompt (see Study.customPrompt).
   * When set, takes precedence over the generated template entirely — only
   * RESPONSE_CONTRACT is appended on top, exactly like the discovery-type
   * custom-prompt path (system-prompt.ts). Supports the `{{participant_name}}`
   * placeholder.
   */
  customPrompt: string | null;
  /**
   * True only on the single turn immediately following OPEN_FLOOR_UTTERANCE
   * (see feedback-agent.ts) — the participant's reply to the guaranteed
   * "anything else on your mind?" closer. Drives CLOSING_GUIDANCE, which
   * tells the LLM to give a brief, warm closing statement responding to
   * whatever they just said. FeedbackAgent forces shouldEndInterview true on
   * this turn regardless of what the model returns — this guidance exists so
   * the utterance itself still reads as a coherent close, not so the model
   * can be trusted with the actual decision.
   */
  isClosingTurn: boolean;
}

/**
 * Prepended — not appended — once `isClosingTurn` is true, same positioning
 * rationale as discovery-type's TIME_CHECK_GUIDANCE: appended after a long
 * directive section risks being ignored.
 */
const CLOSING_GUIDANCE = `## Closing
The participant just answered your "anything else on your mind" question. This really is the end of the call — do not ask another question, however interesting their answer was, and do not set up or preview anything further. Give a brief, warm, complete goodbye responding naturally to what they just said — this is the last thing the participant will hear, so say it like a real send-off (e.g. thank them, wish them well), not a placeholder.

---

`;

/**
 * The feedback-type analog of discovery's "Style"/"Structure"/"Interviewing
 * technique" sections — translates FEEDBACK_STUDY_TYPE.md's decision 10
 * into concrete instructions. The open-floor closer itself (decision 11) is
 * never left to the model to compose or time — FeedbackAgent appends its own
 * scripted OPEN_FLOOR_UTTERANCE immediately after whatever the model says on
 * the turn it sets shouldEndInterview: true. This guidance's job is only to
 * make sure the model's own utterance on that turn reads naturally right
 * before that appended question — a brief acknowledgment, not a goodbye —
 * since telling the model to compose the same question itself produced a
 * confusing double-ending (a full "take care, good luck" send-off
 * immediately followed by one more question — see bug report, 2026-09-17).
 */
const QUESTION_TECHNIQUE_GUIDANCE = `## How to ask the feedback questions
You have a list of things to cover, but you are not reading a script — treat the list as priorities, not a fixed order or fixed wording.

- If an item bundles two ideas together, split it into two separate questions and ask them one at a time — never force the participant to answer two things at once. Decide in the moment which of the two (or whether both) fits in the time you have left.
- Prefer asking about a specific moment or memory over a general impression — "what's one thing from today that stood out?" beats "how was it overall?" A vague question invites a vague, polite non-answer.
- Ask what happened before asking for a verdict. "Walk me through what happened when..." surfaces real detail; "did X work well?" only surfaces a yes/no with nothing behind it.
- Keep every question neutral. Never phrase a question in a way that hints at the answer you want, and never combine a leading remark with a question in the same breath.
- Make sure you cover both what worked and what didn't over the course of the conversation — don't let it drift into only collecting complaints, and don't let politeness mean you only hear positives either.
- Once you've worked through what's worth covering from your list, set shouldEndInterview: true on that turn — but do not ask the final open-ended catch-all yourself and do not say goodbye, wrap up, or give any kind of send-off. The system automatically appends its own "anything else on your mind?" question right after your utterance the moment you set shouldEndInterview: true, so anything you say here is followed immediately by one more question in the same turn. Keep your utterance a brief, natural acknowledgment of what they just said (e.g. "Thanks, that's really helpful context.") — never a full goodbye, since the call isn't actually ending yet.`;

/**
 * Builds the system prompt for a feedback-type interview — see
 * FEEDBACK_STUDY_TYPE.md for the full design. Pure function of context, no
 * conversation state of its own, rebuilt fresh each turn by FeedbackAgent so
 * `isClosingTurn` stays current.
 */
export function buildFeedbackSystemPrompt(context: FeedbackPromptContext): string {
  const {
    participantFirstName,
    studyTitle,
    studyDescription,
    feedbackQuestions,
    customPrompt,
    isClosingTurn,
  } = context;
  const closingGuidance = isClosingTurn ? CLOSING_GUIDANCE : "";

  if (customPrompt) {
    const interpolated = interpolate(customPrompt, {
      participant_name: participantFirstName,
    });
    return `${closingGuidance}${interpolated}\n\n${RESPONSE_CONTRACT}`;
  }

  const questionsList = feedbackQuestions.map((q) => `- ${q}`).join("\n");

  return `${closingGuidance}You are ${INTERVIEWER_NAME}, gathering quick feedback from ${participantFirstName} about "${studyTitle}" — ${studyDescription}. Aim to wrap up in about ${FEEDBACK_TARGET_MINUTES} minutes.

## Priorities to cover
${questionsList}

${QUESTION_TECHNIQUE_GUIDANCE}

## Tone
Warm, brief, conversational — this is a quick check-in, not a formal interview. Keep your own turns short: one question at a time, no long monologues.

${RESPONSE_CONTRACT}`;
}
