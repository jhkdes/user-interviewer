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
  },
  required: ["utterance", "shouldEndInterview"],
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
        "The participant's role/day-to-day responsibility, in their own words, as stated in the transcript. Null if they never clearly stated one — never invent or infer this.",
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
