import type { Rubric } from "../rubric/rubric";

/**
 * JSON schema for the extractor's structured output, built from the rubric so
 * behavior ids and evidence bases cannot drift from the rubric config.
 *
 * This is the "wire" format. Claude's structured outputs allow at most 16
 * nullable or union-typed fields in a schema, and the ledger has far more
 * optional values than that. So the wire format has no nulls: an unknown string
 * is "", an unknown number is -1, an unknown enum value is "none", an optional
 * object is a list of zero or one items, and a yes/no/unknown boolean is an
 * enum. `fromWireLedger` (wire.ts) converts it to the clean `EvidenceLedger`
 * the rest of the code uses.
 */

export const SOURCE_IDS = [
  "cold_application",
  "referral_from_contact",
  "recruiter_inbound",
  "recruiter_sought",
  "former_colleague_or_network",
  "direct_outreach",
  "community_or_event",
  "content_or_research",
  "other",
] as const;

const str = (description?: string) =>
  ({ type: "string", ...(description ? { description } : {}) }) as const;
const num = (description?: string) =>
  ({ type: "integer", ...(description ? { description } : {}) }) as const;

const EMPTY_STRING = 'Use "" when there is none.';
const UNKNOWN_NUMBER = "Use -1 when unknown or not stated.";

const applicationProfileSchema = {
  type: "object",
  properties: {
    description: str("One sentence: what the role or opportunity was."),
    source: {
      type: "string",
      enum: [...SOURCE_IDS, "none"],
      description: 'Use "none" when unclear.',
    },
    fit: str(`How well it matched, in the participant's terms. ${EMPTY_STRING}`),
    timeMinutes: num(`Rough minutes spent; for a range, the midpoint. ${UNKNOWN_NUMBER}`),
    timeNote: str(`The participant's own wording for the time, if useful. ${EMPTY_STRING}`),
    postingAge: str(
      `How old the posting was when they applied, in their words (for example "about a week"). ${EMPTY_STRING}`,
    ),
    research: str(`What they did to understand the role or company beforehand. ${EMPTY_STRING}`),
    positioning: str(`How they positioned themselves (resume tailoring, story). ${EMPTY_STRING}`),
    humanContact: str(
      `Whether anyone knew them before or soon after they applied. ${EMPTY_STRING}`,
    ),
    aiUse: str(EMPTY_STRING),
    followUp: str(`What they did after submitting. ${EMPTY_STRING}`),
  },
  required: [
    "description",
    "source",
    "fit",
    "timeMinutes",
    "timeNote",
    "postingAge",
    "research",
    "positioning",
    "humanContact",
    "aiUse",
    "followUp",
  ],
  additionalProperties: false,
} as const;

export function buildLedgerSchema(rubric: Rubric) {
  const behaviorIds = rubric.behaviors.map((behavior) => behavior.id);
  const evidenceBases = Object.keys(rubric.evidenceBases);

  return {
    type: "object",
    properties: {
      behaviors: {
        type: "array",
        description: `Exactly one entry for each of the ${behaviorIds.length} behaviors, in rubric order.`,
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: behaviorIds },
            status: {
              type: "string",
              enum: ["rated", "insufficient_evidence", "not_applicable"],
              description:
                "rated: there is evidence to pick an anchor. insufficient_evidence: the topic was not discussed or only vaguely (never use a score of 0 for this). not_applicable: only where the rubric allows it for this behavior.",
            },
            score: {
              type: "integer",
              enum: [-1, 0, 1, 2, 3, 4],
              description: "The 0-4 anchor that best fits. Use -1 unless status is rated.",
            },
            evidenceBasis: {
              type: "string",
              enum: [...evidenceBases, "none"],
              description:
                'The best kind of evidence behind the score. Use "none" unless status is rated.',
            },
            subSignals: {
              type: "array",
              description:
                "The sub-signals from the rubric that you found evidence for (or evidence of absence), each with a short neutral observation.",
              items: {
                type: "object",
                properties: { name: str(), observation: str() },
                required: ["name", "observation"],
                additionalProperties: false,
              },
            },
            quotes: {
              type: "array",
              description:
                "Short verbatim quotes from the PARTICIPANT's turns that support the score. Copy the participant's words exactly.",
              items: {
                type: "object",
                properties: {
                  turnIndex: num("Index of the participant turn in the transcript."),
                  text: str(),
                },
                required: ["turnIndex", "text"],
                additionalProperties: false,
              },
            },
            confidenceNote: str(
              `Contradictions or uncertainty affecting confidence in this score. ${EMPTY_STRING}`,
            ),
            trajectoryNote: str(
              `How the behavior has changed over the search, if meaningfully different from now. ${EMPTY_STRING}`,
            ),
            statusReason: str(
              `Required when status is insufficient_evidence or not_applicable: why. ${EMPTY_STRING}`,
            ),
          },
          required: [
            "id",
            "status",
            "score",
            "evidenceBasis",
            "subSignals",
            "quotes",
            "confidenceNote",
            "trajectoryNote",
            "statusReason",
          ],
          additionalProperties: false,
        },
      },
      facts: {
        type: "object",
        properties: {
          targetSummary: str(
            `One or two sentences on the target the participant described. ${EMPTY_STRING}`,
          ),
          matchRate: {
            type: "object",
            properties: {
              matched: num(
                `Applications that matched the target, if the participant gave a number. ${UNKNOWN_NUMBER}`,
              ),
              outOf: num(
                `The size of the set they were estimating over (usually about 20). ${UNKNOWN_NUMBER}`,
              ),
              basis: {
                type: "string",
                enum: [...evidenceBases, "none"],
                description: 'Use "none" if no number was given.',
              },
            },
            required: ["matched", "outOf", "basis"],
            additionalProperties: false,
          },
          totalConversations: num(
            `Total recruiter conversations or interviews the participant counted. ${UNKNOWN_NUMBER}`,
          ),
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string", enum: [...SOURCE_IDS] },
                count: num(UNKNOWN_NUMBER),
              },
              required: ["source", "count"],
              additionalProperties: false,
            },
          },
          effortSplit: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source: { type: "string", enum: [...SOURCE_IDS] },
                sharePercent: num(
                  `A stated or clearly implied percentage of search time. ${UNKNOWN_NUMBER}`,
                ),
                qualitative: str(
                  `The participant's own words about effort on this path, when they gave no number. ${EMPTY_STRING}`,
                ),
              },
              required: ["source", "sharePercent", "qualitative"],
              additionalProperties: false,
            },
          },
          volunteeredContext: {
            type: "array",
            items: { type: "string" },
            description:
              "Context the participant volunteered about their situation (energy, money pressure, a gap, a side project). Never scored.",
          },
          supportProviders: {
            type: "array",
            items: { type: "string" },
            description:
              "Names of the career coach, outplacement firm, or program the participant named in the interview, exactly as they said them. Empty if they named none.",
          },
        },
        required: [
          "targetSummary",
          "matchRate",
          "totalConversations",
          "sources",
          "effortSplit",
          "volunteeredContext",
          "supportProviders",
        ],
        additionalProperties: false,
      },
      comparison: {
        type: "object",
        properties: {
          typical: {
            type: "array",
            description:
              "Zero or one item: a typical recent application. Empty if none was described.",
            items: applicationProfileSchema,
          },
          successful: {
            type: "array",
            description:
              "Zero or one item: the opportunity that produced a recruiter conversation or interview, or the furthest-progress one. Empty if none was described.",
            items: applicationProfileSchema,
          },
          successfulIsFurthestProgressOnly: { type: "boolean" },
          describedApplicationIsTypical: {
            type: "string",
            enum: ["yes", "no", "unknown"],
            description:
              "Whether the participant said the application they described is typical of how they apply.",
          },
          participantExplanation: str(
            `Their own explanation of what was different about the successful opportunity. ${EMPTY_STRING}`,
          ),
        },
        required: [
          "typical",
          "successful",
          "successfulIsFurthestProgressOnly",
          "describedApplicationIsTypical",
          "participantExplanation",
        ],
        additionalProperties: false,
      },
      reportPriority: {
        type: "array",
        description:
          "Zero or one item: the participant's answer to the closing question about what they most want help with. Empty if it was never asked or answered.",
        items: {
          type: "object",
          properties: {
            text: str(
              'A short phrase restating what they most want help with, in their own terms, that reads naturally under the heading "What you most want help with". No filler words, pronouns, or "the participant".',
            ),
            turnIndex: num("The participant turn where they said it."),
          },
          required: ["text", "turnIndex"],
          additionalProperties: false,
        },
      },
      conflicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: str(),
            turnIndexes: { type: "array", items: { type: "integer" } },
          },
          required: ["description", "turnIndexes"],
          additionalProperties: false,
        },
      },
    },
    required: ["behaviors", "facts", "comparison", "reportPriority", "conflicts"],
    additionalProperties: false,
  } as const;
}
