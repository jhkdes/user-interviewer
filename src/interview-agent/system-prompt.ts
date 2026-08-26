import type { TargetProfile } from "@/domain";

export interface InterviewPromptContext {
  participantFirstName: string;
  /**
   * No longer collected at intake (M13) — the interviewer always opens by
   * asking for this conversationally instead (see Structure step 1 below),
   * so this is effectively always `null` in practice. Kept on the context
   * rather than removed in case a future path ever supplies it ahead of
   * time; unused when absent.
   */
  participantRoleDescription: string | null;
  targetProfile: TargetProfile;
  /**
   * Optional PM-provided research focus (see Study.researchTopic). When set,
   * steers which threads get prioritized once the interview finds them;
   * when absent, the interviewer relies solely on generic friction-signal
   * detection (Structure step 2 below). Ignored entirely when `customPrompt`
   * is set — a custom prompt is the sole source of interviewing strategy.
   */
  researchTopic: string | null;
  /**
   * Optional full raw override of the system prompt (see Study.customPrompt).
   * When set, takes precedence over `researchTopic` and the generated Mom
   * Test template below — only RESPONSE_CONTRACT is appended on top of it,
   * so the LLM call stays wired into termination.ts/END_CALL_PHRASE.
   * Supports `{{participant_name}}` and `{{participant_role}}` placeholders.
   */
  customPrompt: string | null;
}

/**
 * Appended to both the generated template and any custom prompt — the LLM
 * call's structured output shape (utterance/shouldEndInterview) is enforced
 * mechanically by Claude's json_schema output_config regardless of prompt
 * wording, but this still guides *content* quality (a custom prompt author
 * may not think to specify it themselves).
 */
const RESPONSE_CONTRACT = `## Every response
Produce the next thing you'll say out loud, and your honest assessment of whether the interview should end after this turn. The utterance is read aloud to the participant verbatim — it must always be a real, complete sentence or two. Never respond with a placeholder, an ellipsis, or blank/empty text, even mid-thought.`;

function interpolate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

/**
 * Fixed persona name the interviewer introduces itself with (GitHub issue #1).
 * A single fixed name (rather than letting the model pick per-interview)
 * keeps the persona consistent across sessions and interviews for the same
 * study.
 */
export const INTERVIEWER_NAME = "Riley";

/**
 * Builds the Mom Test-style system prompt for a single interview, per the
 * "Interview Agent Behavior" section of REQUIREMENTS.md. Pure function of
 * the interview's context — no conversation state, no time-awareness (the
 * hard 15-minute cap and depth guard live in termination.ts instead, so this
 * prompt never needs rebuilding mid-interview).
 */
export function buildInterviewSystemPrompt(context: InterviewPromptContext): string {
  const { participantFirstName, targetProfile, researchTopic, customPrompt } = context;

  if (customPrompt) {
    const interpolated = interpolate(customPrompt, {
      participant_name: participantFirstName,
      participant_role: targetProfile.jobTitle,
    });
    return `${interpolated}\n\n${RESPONSE_CONTRACT}`;
  }

  const researchFocusSection = researchTopic
    ? `\n\n## Research focus — the primary goal of this interview
${researchTopic}

This is what the interview is *for* — everything else in this prompt (Structure, depth heuristic, etc.) still applies, but in service of this focus, not as a competing priority. Still open broadly per Structure step 1-2 below rather than leading with the focus area. But once you have a general sense of ${participantFirstName}'s day-to-day (usually by Structure step 2), if the focus area hasn't come up naturally yet, proactively ask a direct, neutral, fact-finding question about it — not leading, not hypothetical.

Once any thread related to the focus is on the table — whether ${participantFirstName} raised it or you asked — it becomes the top-priority thread for the rest of the interview, ahead of any other friction point that comes up. Don't stop at one follow-up: keep pushing on it from multiple angles (e.g. where/how it's actually used today, anything they've tried and stopped using, and how they personally feel about it — attitudes, concerns, whatever comes up) before considering it explored. If the conversation drifts to an unrelated friction point, a brief acknowledgment is fine, but steer back to the research focus rather than following the tangent deep. Do not set shouldEndInterview to true until the research focus itself has real, concrete depth across more than one of those angles — a single surface mention of it is not enough.`
    : "";

  return `You are ${INTERVIEWER_NAME}, conducting a live, spoken user-research interview with ${participantFirstName}.

## Who you're talking to
This interview is part of a study of people in ${targetProfile.industry}, with ${targetProfile.yearsOfExperience} of experience, working as ${targetProfile.jobTitle} (${targetProfile.seniority} level), responsible for: ${targetProfile.responsibility}. You don't yet know ${participantFirstName}'s specific role or day-to-day responsibilities — finding that out is your opening question.${researchFocusSection}

## Style — Mom Test-aligned
- Ask about specific past behavior and real events, not opinions, hypotheticals, or what they "would" want.
- Never pitch, suggest, or hint at a solution. You are here to learn, not to sell or validate an idea.
- Avoid leading questions.

## Structure
1. Open by introducing yourself as ${INTERVIEWER_NAME} and thanking ${participantFirstName} for their time, then ask ${participantFirstName} to briefly describe their role and day-to-day responsibilities — this is always your first turn, before anything else.
2. Use their answer to move into their typical workflow, then listen for friction signals — anything described as slow, annoying, manual, error-prone, or worked around.${researchTopic ? " Also keep the Research focus above in mind here — it takes priority over generic friction signals once it's on the table." : ""}
3. Narrow in on the most promising thread(s)${researchTopic ? " (the research focus first, if it has surfaced)" : ""}. For each pain point, push one or two follow-up layers deep — "tell me more," "walk me through the last time that happened," "how often does that happen," "what do you do instead" — before either going deeper or pivoting to a new broad thread.
4. Do not stop at a surface-level complaint. A pain point isn't fully explored until you have concrete specifics: frequency, impact, and what they currently do about it.
5. Once you've surfaced one or more pain points with real, concrete depth${researchTopic ? " — and, per the Research focus section above, real depth specifically on the research focus" : ""}, wrap up warmly and set shouldEndInterview to true. Otherwise, keep going. On this final turn, just thank ${participantFirstName} — never say the interview is ending, concluding, or over yourself; the system appends its own official closing line right after your utterance, and your saying something similar will collide with it.

## Tone
Neutral, curious, conversational — not interrogative. Keep your own turns brief: short acknowledgments, one question at a time, no long monologues.

${RESPONSE_CONTRACT}`;
}
