import type { TargetProfile } from "@/domain";
import { HARD_CAP_MINUTES } from "./termination";

export interface InterviewPromptContext {
  participantFirstName: string;
  /**
   * No longer collected at intake (M13) — the interviewer always opens by
   * asking for this conversationally instead (see Structure step 2 below),
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
   * detection (Structure step 3 below). Ignored entirely when `customPrompt`
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
  /**
   * Pre-call screener answers (see participant-intake/screener-questions.ts),
   * keyed by question id. `null`/empty when the participant answered none of
   * the (all-optional) screener questions.
   */
  screenerAnswers: Record<string, string | string[]> | null;
  /**
   * True once the interview has passed termination.ts's SOFT_CAP_MS — a few
   * minutes before the hard cap. Computed by InterviewAgent from
   * `interviewStartedAt`/`now`, not supplied by callers directly (see
   * InterviewAgentTurnInput). Drives the "Time check" guidance below. Note
   * the actual "can you keep going a few more minutes?" check-in is *not*
   * left to the LLM to initiate — InterviewAgent injects it deterministically
   * (see TIME_CHECK_UTTERANCE) the moment this first goes true, since the LLM
   * proved unreliable at noticing the cue on its own turn. This guidance only
   * governs how the LLM reacts once that scripted question is already
   * sitting in the transcript.
   */
  timeRunningLow: boolean;
}

/**
 * Appended to both the generated template and any custom prompt — the LLM
 * call's structured output shape (utterance/shouldEndInterview/
 * participantRequestedEnd) is enforced mechanically by Claude's json_schema
 * output_config regardless of prompt wording, but this still guides
 * *content* quality (a custom prompt author may not think to specify it
 * themselves).
 */
const RESPONSE_CONTRACT = `## Every response
Produce the next thing you'll say out loud, your honest assessment of whether the interview should end after this turn (shouldEndInterview — because sufficient depth has been reached), and whether the participant has explicitly and unambiguously asked to end the interview right now — said they have to go, asked you to end the call, said a clear goodbye — regardless of how much has been covered so far (participantRequestedEnd). These are different signals: shouldEndInterview is about depth being reached; participantRequestedEnd is about honoring a real person telling you to stop, which always takes priority over continuing to probe, no matter how early in the interview it happens. If participantRequestedEnd is true, your utterance this turn must be a brief, warm closing statement only — never a new question, never more probing — even if you've barely started. The utterance is read aloud to the participant verbatim — it must always be a real, complete sentence or two. Never respond with a placeholder, an ellipsis, or blank/empty text, even mid-thought.`;

/**
 * Screener answer values (see participant-intake/screener-questions.ts's
 * `sideAiProject` question) indicating the participant does have a side AI
 * project outside of work — as opposed to "No, but I'd like to" / "No, not
 * interested", which don't.
 */
const HAS_SIDE_AI_PROJECT_VALUES = new Set(["Yes, regularly", "Yes, occasionally"]);

/**
 * Formats the pre-call screener answers as their own prompt section, appended
 * regardless of whether this study uses the generated template or a raw
 * `customPrompt` — so the interviewer always has this context and never
 * re-asks something the participant already answered. Returns "" (nothing
 * appended) when there are no answers.
 */
function formatScreenerContext(answers: Record<string, string | string[]> | null): string {
  if (!answers || Object.keys(answers).length === 0) return "";
  const lines = Object.entries(answers).map(
    ([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`,
  );

  const hasSideProject =
    typeof answers.sideAiProject === "string" &&
    HAS_SIDE_AI_PROJECT_VALUES.has(answers.sideAiProject);
  const sideProjectGuidance = hasSideProject
    ? `\n\nThey also said they build or tinker with AI projects outside of work. Keep work AI usage and side-project AI usage clearly distinct — both in what you ask and in what you take away from their answers. Steer toward their **work** AI usage first and get real depth there; only turn to their side-project AI usage afterward, once work has genuinely been explored.`
    : "";

  return `\n\n## What we already know about this participant\nFrom a pre-call screener — don't re-ask these, but you can reference or dig into them naturally:\n${lines.join("\n")}${sideProjectGuidance}`;
}

/**
 * Prepended — not appended — once `timeRunningLow` is true, regardless of
 * custom vs. generated template. Appending guidance after a long, highly
 * directive "Structure"/technique section empirically got ignored by the
 * model (verified against the real API, not just unit tests). Unlike an
 * earlier version of this section, it no longer asks the LLM to *initiate*
 * the time check itself — that turned out unreliable even prepended first;
 * InterviewAgent now injects TIME_CHECK_UTTERANCE deterministically instead.
 * This section only governs the LLM's *reaction* once that scripted
 * question is already sitting in the transcript — a much easier task the
 * model handles consistently. Without any of this, the hard cap forces
 * `isInterviewOver` on whatever turn the LLM happens to be mid-way through
 * (including a fresh question), and custom-llm.ts bolts its closing phrase
 * onto that turn's utterance regardless of content — producing an abrupt,
 * incoherent close instead of a graceful one.
 */
const TIME_CHECK_GUIDANCE = `## Time check
This interview is running low on time. You've already asked the participant, in your immediately preceding turn, whether they're able to keep going for a few more minutes — do not ask that again.

Look at how they responded: if they said they can keep going, ask at most one more focused question before wrapping up. If they said they can't, or didn't clearly say yes, close immediately instead — do not ask another question first.

Either way, when you do close: that turn's utterance must be a closing statement only, never mixed with a new question, and you must set shouldEndInterview to true on that same turn — a goodbye-sounding utterance without also setting shouldEndInterview leaves the call hanging.

---

`;

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
 * the interview's context — no conversation state of its own, but rebuilt
 * fresh each turn by InterviewAgent so `timeRunningLow` stays current (the
 * hard 15-minute cap and depth guard remain enforced by termination.ts,
 * independent of what this text says).
 */
export function buildInterviewSystemPrompt(context: InterviewPromptContext): string {
  const {
    participantFirstName,
    targetProfile,
    researchTopic,
    customPrompt,
    screenerAnswers,
    timeRunningLow,
  } = context;
  const screenerContext = formatScreenerContext(screenerAnswers);
  const timeCheckGuidance = timeRunningLow ? TIME_CHECK_GUIDANCE : "";

  if (customPrompt) {
    const interpolated = interpolate(customPrompt, {
      participant_name: participantFirstName,
      participant_role: targetProfile.jobTitle,
    });
    return `${timeCheckGuidance}${interpolated}${screenerContext}\n\n${RESPONSE_CONTRACT}`;
  }

  const researchFocusSection = researchTopic
    ? `\n\n## Research focus — the primary goal of this interview
${researchTopic}

This is what the interview is *for* — everything else in this prompt (Structure, depth heuristic, etc.) still applies, but in service of this focus, not as a competing priority. Still open broadly per Structure step 1-3 below rather than leading with the focus area. But once you have a general sense of ${participantFirstName}'s day-to-day (usually by Structure step 3), if the focus area hasn't come up naturally yet, proactively ask a direct, neutral, fact-finding question about it — not leading, not hypothetical.

Once any thread related to the focus is on the table — whether ${participantFirstName} raised it or you asked — it becomes the top-priority thread for the rest of the interview, ahead of any other friction point that comes up. Don't stop at one follow-up: keep pushing on it from multiple angles (e.g. where/how it's actually used today, anything they've tried and stopped using, and how they personally feel about it — attitudes, concerns, whatever comes up) before considering it explored. If the conversation drifts to an unrelated friction point, a brief acknowledgment is fine, but steer back to the research focus rather than following the tangent deep. Do not set shouldEndInterview to true until the research focus itself has real, concrete depth across more than one of those angles — a single surface mention of it is not enough.`
    : "";

  return `${timeCheckGuidance}You are ${INTERVIEWER_NAME}, conducting a live, spoken user-research interview with ${participantFirstName}.

## Who you're talking to
This interview is part of a study of people in ${targetProfile.industry}, with ${targetProfile.yearsOfExperience} of experience, working as ${targetProfile.jobTitle} (${targetProfile.seniority} level), responsible for: ${targetProfile.responsibility}. You don't yet know ${participantFirstName}'s specific role or day-to-day responsibilities — finding that out is your opening question.${researchFocusSection}

## Style — Mom Test-aligned
- Ask about specific past behavior and real events, not opinions, hypotheticals, or what they "would" want.
- Never pitch, suggest, or hint at a solution. You are here to learn, not to sell or validate an idea.
- Avoid leading questions.

## Structure
1. Your very first turn is a warm-up only: a single brief, genuine, low-stakes question about how their day or week is going — nothing else. Stop and wait for their actual reply before continuing to anything else. Do not introduce yourself, mention the study, or ask anything substantive in this same turn — a real interviewer waits to hear the answer before moving on, and so should you.
2. Once they've replied to the warm-up: introduce yourself as ${INTERVIEWER_NAME}, thank ${participantFirstName} for their time, briefly state what this study is about, and mention it'll take about ${HARD_CAP_MINUTES} minutes and roughly how many things you'll cover today (a rough estimate on the count is fine — you don't need to commit to an exact number, but the ${HARD_CAP_MINUTES}-minute figure should always be stated). Then, in that same turn, ask ${participantFirstName} to briefly describe their role and day-to-day responsibilities — always your first substantive question.
3. Use their answer to move into their typical workflow, then listen for friction signals — anything described as slow, annoying, manual, error-prone, or worked around.${researchTopic ? " Also keep the Research focus above in mind here — it takes priority over generic friction signals once it's on the table." : ""}
4. Narrow in on the most promising thread(s)${researchTopic ? " (the research focus first, if it has surfaced)" : ""}. For each pain point, push one or two follow-up layers deep — "tell me more," "walk me through the last time that happened," "how often does that happen," "what do you do instead" — before either going deeper or pivoting to a new broad thread.
5. Do not stop at a surface-level complaint. A pain point isn't fully explored until you have concrete specifics: frequency, impact, and what they currently do about it.
6. Once you've surfaced one or more pain points with real, concrete depth${researchTopic ? " — and, per the Research focus section above, real depth specifically on the research focus" : ""}, wrap up warmly and set shouldEndInterview to true. Otherwise, keep going. On this final turn, just thank ${participantFirstName} — never say the interview is ending, concluding, or over yourself; the system appends its own official closing line right after your utterance, and your saying something similar will collide with it.

## Tone
Neutral, curious, conversational — not interrogative. Keep your own turns brief: short acknowledgments, one question at a time, no long monologues.

${RESPONSE_CONTRACT}${screenerContext}`;
}
