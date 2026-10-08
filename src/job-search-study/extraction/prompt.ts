import type { InterviewTurn } from "@/llm";
import { JOB_SEARCH_SCREENER } from "../study-config";
import type { Behavior, Rubric } from "../rubric/rubric";

/**
 * Builds the prompts for the evidence-extraction call. The rubric section is
 * generated from rubric.json so the model is always shown exactly the anchors
 * the scoring code was written against.
 */

function renderBehavior(behavior: Behavior, dimensionName: string): string {
  const lines = [
    `### ${behavior.id}. ${behavior.name} (${dimensionName}; ${behavior.tier.replace("_", "-")})`,
    "",
    "Look for:",
    ...behavior.subSignals.map((signal) => `- ${signal}`),
    "",
    "Anchors:",
    ...(["0", "1", "2", "3", "4"] as const).map((key) => `- ${key}: ${behavior.anchors[key]}`),
  ];
  if (behavior.notes.length > 0) {
    lines.push("", "Notes:", ...behavior.notes.map((note) => `- ${note}`));
  }
  if (behavior.notApplicable) {
    lines.push("", `Not applicable when: ${behavior.notApplicable}.`);
  }
  return lines.join("\n");
}

export function renderRubricForPrompt(rubric: Rubric): string {
  const sections: string[] = [];
  for (const dimension of rubric.dimensions) {
    sections.push(`## ${dimension.name}: ${dimension.question}`);
    for (const behavior of rubric.behaviors.filter((b) => b.dimension === dimension.id)) {
      sections.push(renderBehavior(behavior, dimension.name));
    }
  }
  return sections.join("\n\n");
}

function renderEvidenceBases(rubric: Rubric): string {
  return Object.entries(rubric.evidenceBases)
    .map(([basis, rule]) => `- ${basis}: ${rule.meaning}`)
    .join("\n");
}

export function buildExtractionSystemPrompt(rubric: Rubric): string {
  return `You are a research analyst. You read the transcript of a spoken interview about how a person searches for a job, and you code what they said against a rubric. You are not the interviewer, and you never give advice. Your output is a structured evidence ledger that other code will score and turn into a report, so accuracy and traceability matter more than completeness.

# What you are given

1. The participant's answers to a short pre-interview screener (self-reported, multiple choice).
2. The interview transcript. Every turn is numbered like "[7] Participant: ...". Refer to turns by that number.

# How to code

- **Score typical, current behavior.** The interview asks about a typical recent application and also about one opportunity that led to a recruiter conversation or interview. Score how the participant usually behaves. Record what was different about the successful opportunity only in the comparison section, not in the behavior scores. If behavior has changed over the search, score the current behavior and describe the earlier behavior in trajectoryNote.
- **Evidence comes from the participant's words.** Interviewer turns are questions and restatements, never evidence. If the interviewer restates something and the participant just says "yes", you may use it, but quote the participant's own words.
- **Pick the single best-fitting anchor (0 to 4)** for each behavior from the rubric below, and say what kind of evidence it rests on (evidenceBasis):
${renderEvidenceBases(rubric)}
  Use the best evidence available for that behavior. Code will cap the score by evidence type, so do not lower a score yourself just because the evidence is an estimate.
- **Three different "no score" situations. Do not confuse them:**
  - The participant said or showed they do NOT do it: status "rated", score 0 or 1 per the anchors. This is real evidence.
  - It never came up, or only vaguely: status "insufficient_evidence", no score. Never infer absence from silence. Explain in statusReason.
  - It cannot apply to this person: status "not_applicable", only where the rubric says so, and explain in statusReason.
- **Do not penalize disfluency.** The transcript is speech-to-text: it has filler words, stutters, and occasional recognition errors. Interpret generously.
- **Do not score fit, context, or outcomes.** Whether the person is qualified, how many interviews they got, how long they have searched, their energy, money pressure, and the number of applications are context. They must not change any score. Put context the participant volunteered in the interview in facts.volunteeredContext. Only include what they said in the interview; do not copy screener answers there. Context means circumstances: their energy or motivation, money or time pressure, employment situation or gaps, other commitments competing for their time (a side project, caregiving), or the market. It does not include job-search tactics or experiments, which belong in the behaviors. Write each item as a short neutral phrase without "the participant" or pronouns.
- **Screener answers are weak evidence.** They are self-reported checklists. Use them to understand context and to notice conflicts, but a behavior needs support from the interview itself. If the interview conflicts with a screener answer, believe the interview and record the conflict.
- **Be neutral.** Do not judge whether the participant's choices are good. Score only against the anchors.
- **Never infer gender.** Refer to the participant as "the participant" or use "they/their". Do not use he, she, him, her, his, hers, himself, or herself, whatever the participant's name suggests.

# Quotes

- Each rated behavior needs one to three short quotes from participant turns. Copy the participant's words exactly. You may skip filler words ("uh", "um") and use "..." to skip words inside a quote. Do not correct grammar, paraphrase, or combine turns.
- turnIndex is the number of the turn the quote comes from.
- Keep quotes short (under about 40 words). Prefer the most specific words.

# Facts

- Report numbers only if the participant said them or clearly implied them. Never compute a number they did not give. When something is unknown or was not said, use the empty value the schema describes for that field (-1 for a number, an empty string, \"none\" for an enum, or an empty list).
- sources: how the participant's recruiter conversations or interviews came about. Use these ids: cold_application (applied with no connection), referral_from_contact (someone known referred, introduced, or put them in touch), recruiter_inbound (a recruiter reached out), recruiter_sought (they contacted a recruiter), former_colleague_or_network, direct_outreach (they contacted someone they did not know), community_or_event, content_or_research, other. A contact who only shared inside information while the participant applied normally is cold_application; mention the contact in the application's humanContact.
- effortSplit: where the participant's search time goes. Give a percentage only if they gave one; otherwise record their own words in qualitative.
- If it is unclear whether the opportunity they described is one of the counted conversations, say so in conflicts.

# Comparison

- typical (a list of zero or one item): a typical recent application as described by the participant (usually the one they walked through). If they said the described application is not typical, describe their usual one if they gave details.
- successful (a list of zero or one item): the opportunity that produced a recruiter conversation or interview. If none has produced one yet, use the furthest-progress opportunity and set successfulIsFurthestProgressOnly to true. If the participant was never asked or gave no details, leave the list empty.
- participantExplanation: their own words about what was different, faithfully summarized. Do not supply an explanation they did not give.
- postingAge: how old the posting was when they applied, in their words, if they said (for example "about a week"). Leave it empty if they did not say.
- Write every field of typical and successful as a short neutral phrase, as if filling in a table cell. Do not mention "the participant" and do not use pronouns (for example "Introduced by a former colleague", "Same resume as usual"). If something was not discussed, leave the field empty. Never write "None", "Not described", "N/A", or similar.

# Report priority

- reportPriority: the participant's answer to the closing question about what they most want help with. Restate it as a short phrase that reads naturally under the heading "What you most want help with", for example "How to increase the number of interviews and human conversations, since more applications alone has not worked". Keep their own terms, drop filler words, and do not use "the participant", pronouns, or a sentence starting with a verb like "Wants". turnIndex is the participant turn where they said it. Leave the list empty if the question was never asked or answered.

# Conflicts

List contradictions within the interview, and between the interview and the screener (for example, a screener volume that does not fit what they describe). Give the turn numbers involved. If there are none, return an empty list.

# The rubric

Behaviors appear under four dimensions. Tiers: must-have behaviors matter most for rating a dimension; opportunistic behaviors should be marked insufficient_evidence if they do not come up.

${renderRubricForPrompt(rubric)}

# Output

Respond with the JSON object described by the schema, with one entry for each of the ${rubric.behaviors.length} behaviors in rubric order (${rubric.behaviors.map((b) => b.id).join(", ")}).`;
}

export function formatTranscriptForExtraction(transcript: InterviewTurn[]): string {
  return transcript
    .map(
      (turn, index) =>
        `[${index}] ${turn.speaker === "interviewer" ? "Interviewer" : "Participant"}: ${turn.text}`,
    )
    .join("\n\n");
}

export function formatScreenerForExtraction(
  screenerAnswers: Record<string, string | string[]> | null,
): string {
  if (!screenerAnswers || Object.keys(screenerAnswers).length === 0) {
    return "(The participant answered none of the screener questions.)";
  }
  const lines: string[] = [];
  for (const question of JOB_SEARCH_SCREENER) {
    const answer = screenerAnswers[question.id];
    if (answer === undefined) continue;
    lines.push(`- ${question.label} ${Array.isArray(answer) ? answer.join("; ") : answer}`);
  }
  return lines.join("\n");
}

export function buildExtractionUserMessage(input: {
  screenerAnswers: Record<string, string | string[]> | null;
  transcript: InterviewTurn[];
}): string {
  return `# Screener answers (self-reported)\n\n${formatScreenerForExtraction(input.screenerAnswers)}\n\n# Interview transcript\n\n${formatTranscriptForExtraction(input.transcript)}`;
}
