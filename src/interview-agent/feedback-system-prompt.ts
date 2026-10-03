import {
  INTERVIEWER_NAME,
  RESPONSE_CONTRACT,
  TEXT_RESPONSE_CONTRACT,
  interpolate,
} from "./shared-prompt-parts";
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
  /**
   * How the participant is taking the interview. Defaults to `"voice"`, which
   * produces exactly the prompt voice interviews have always used. `"text"`
   * (a written chat — see TEXT_INTERVIEW_MODE.md) adds TEXT_CHANNEL_GUIDANCE
   * and swaps in the written-chat response contract.
   */
  channel?: "voice" | "text";
  /**
   * Text channel only: the time cap has already passed when this turn is
   * generated. Drives TEXT_TIME_UP_GUIDANCE so the model's reply doesn't end
   * on a question right before the system appends its fixed closing line
   * (see feedback-agent.ts's TEXT_TIME_CAP_UTTERANCE).
   */
  timeUp?: boolean;
}

/**
 * Appended after the generated template (and after a study's custom prompt,
 * which is usually written for voice) when the participant is taking the
 * interview by typing. Everything above it that mentions a call, speaking, or
 * hearing is meant for this written chat instead — hence the first line.
 */
export const TEXT_CHANNEL_GUIDANCE = `## This is a written chat
Everything above that mentions a call, speaking, or hearing applies to a written chat instead: the participant is reading your messages and typing their replies. Casual spoken rapport doesn't carry over to typing, so write for someone reading on a screen:

- Keep every message short: one question per message, usually one to three short sentences, well under about 40 words.
- Skip small talk and rapport openers like "How's your week?" or "How are you doing today?". A friendly one-line greeting by first name is fine, then go straight to a concrete question about the session.
- Ask questions that are easy to answer in a sentence or two. Prefer a specific moment ("What's one thing from today that stood out?") over a broad or abstract prompt. If a question has two parts, ask one at a time.
- No long preambles and no stacked acknowledgments ("Great, thanks so much for that, that's really helpful, and I appreciate you sharing…"). One short acknowledgment at most, then the next question.
- Plain text only: no bullet lists, headings, bold, or emoji.
- No spoken-style filler, and don't refer to talking, hearing, or listening ("thanks for sharing that" is fine; "I hear you" is not).
- If the participant gives a short answer, accept it and move on, or ask one small follow-up. Don't pad.
- If the participant says they need to go or want to stop, honour it straight away with a short, friendly goodbye. Don't ask another question or try to keep them.`;

/**
 * Prepended, same positioning rationale as CLOSING_GUIDANCE. Used only on the
 * text channel when the time cap has already passed: the system appends its
 * own fixed "we're out of time" line after whatever the model says, so the
 * model's part must be a brief acknowledgment with no question.
 */
const TEXT_TIME_UP_GUIDANCE = `## Time is up
The time for this feedback chat has run out. Do not ask another question, however interesting the participant's last message was, and do not say goodbye — the system adds the closing line right after your message. Reply with a single short acknowledgment of what they just said (for example "Thanks, that's helpful to know.").

---

`;

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
    channel = "voice",
    timeUp = false,
  } = context;
  const isText = channel === "text";
  const closingGuidance =
    (isText && timeUp ? TEXT_TIME_UP_GUIDANCE : "") + (isClosingTurn ? CLOSING_GUIDANCE : "");
  const channelGuidance = isText ? `${TEXT_CHANNEL_GUIDANCE}\n\n` : "";
  const responseContract = isText ? TEXT_RESPONSE_CONTRACT : RESPONSE_CONTRACT;

  if (customPrompt) {
    const interpolated = interpolate(customPrompt, {
      participant_name: participantFirstName,
    });
    return `${closingGuidance}${interpolated}\n\n${channelGuidance}${responseContract}`;
  }

  const questionsList = feedbackQuestions.map((q) => `- ${q}`).join("\n");

  return `${closingGuidance}You are ${INTERVIEWER_NAME}, gathering quick feedback from ${participantFirstName} about "${studyTitle}" — ${studyDescription}. Aim to wrap up in about ${FEEDBACK_TARGET_MINUTES} minutes.

## Priorities to cover
${questionsList}

${QUESTION_TECHNIQUE_GUIDANCE}

## Tone
Warm, brief, conversational — this is a quick check-in, not a formal interview. Keep your own turns short: one question at a time, no long monologues.

${channelGuidance}${responseContract}`;
}
