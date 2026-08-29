/** JSON schemas passed to Claude's structured outputs (`output_config.format`). */

export const interviewerTurnSchema = {
  type: "object",
  properties: {
    utterance: {
      type: "string",
      description:
        "What the interviewer says next, out loud, verbatim and read aloud to the participant. Always a real, complete sentence or two — never a placeholder, an ellipsis, or blank text.",
    },
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
  required: ["utterance", "shouldEndInterview", "participantRequestedEnd"],
  additionalProperties: false,
} as const;

export const summarySchema = {
  type: "object",
  properties: {
    painPoints: { type: "array", items: { type: "string" } },
    notableQuotes: { type: "array", items: { type: "string" } },
    takeaways: { type: "array", items: { type: "string" } },
    roleDescription: {
      type: ["string", "null"],
      description:
        'A short job title for the participant (e.g. "Product Manager", "Engineering Manager"), distilled from what they said in the transcript — not a verbatim quote and not their day-to-day responsibilities. Null if they never clearly stated a role — never invent or infer this.',
    },
  },
  required: ["painPoints", "notableQuotes", "takeaways", "roleDescription"],
  additionalProperties: false,
} as const;

export const studyReportSchema = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          theme: { type: "string" },
          participantCount: { type: "number" },
          representativeQuotes: { type: "array", items: { type: "string" } },
        },
        required: ["theme", "participantCount", "representativeQuotes"],
        additionalProperties: false,
      },
    },
  },
  required: ["themes"],
  additionalProperties: false,
} as const;
