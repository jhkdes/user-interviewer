import type { InterviewSnapshot, PartnerInvitation, Study } from "@/domain";
import { buildTokenValues, renderTemplate } from "./render-prompt";
import { DEFAULT_HARD_STOP_MINUTES, DEFAULT_TARGET_MINUTES } from "./study-input";

/**
 * Freezes what a partner interview starts with: the study's prompt, opening
 * line and closing question with this colleague's details filled in, plus the
 * timing. Stored on the interview, so a later PATCH of the study changes only
 * interviews that start afterward.
 *
 * The prompt ends with a sentence about the interview's length, so the
 * interviewer paces itself to the study's timing; the call is also cut off by
 * the hard stop itself (see FeedbackAgent).
 */
export function buildInterviewSnapshot(
  study: Study,
  invitation: PartnerInvitation,
): InterviewSnapshot {
  const targetMinutes = study.targetMinutes ?? DEFAULT_TARGET_MINUTES;
  const hardStopMinutes = study.hardStopMinutes ?? DEFAULT_HARD_STOP_MINUTES;
  const tokens = buildTokenValues({
    subjectName: study.subjectName,
    colleagueFirstName: invitation.colleagueFirstName,
    context: invitation.context,
    targetMinutes,
    hardStopMinutes,
  });

  const prompt =
    `${renderTemplate(study.customPrompt ?? "", tokens, "prompt")}\n\n` +
    `This interview should take about ${targetMinutes} minutes. The call ends automatically after ${hardStopMinutes} minutes, so be wrapping up well before then.`;

  const spoken = (template: string | null): string | null => {
    if (!template?.trim()) return null;
    return renderTemplate(template, tokens, "spoken").replace(/\s+/g, " ").trim() || null;
  };

  return {
    prompt,
    firstMessage: spoken(study.firstMessage),
    closingQuestion: spoken(study.closingQuestion),
    targetMinutes,
    hardStopMinutes,
  };
}
