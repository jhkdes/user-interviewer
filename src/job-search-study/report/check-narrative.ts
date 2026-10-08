import type { DimensionId } from "../rubric/rubric";

/**
 * Deterministic guardrails on the narrative text the model writes for the
 * participant. The model is told the rules; this checks them, because the
 * report must never show a number the participant did not give us, a score or
 * percentile, a guess at gender, or coaching language.
 */

export interface NarrativeText {
  executiveSummary: string;
  whatWeHeard: string;
  channelsNarrative: string;
  bottomLine: string;
  dimensions: Array<{ id: DimensionId; strengthText: string; improvementText: string }>;
}

export interface NarrativeExpectations {
  /** Digit strings that appear in the data given to the writer. Any other number in the text is invented. */
  allowedNumbers: Set<string>;
  /** Per dimension: whether a strength / improvement was chosen, so some text is required for it. */
  dimensions: Array<{ id: DimensionId; hasStrength: boolean; hasImprovement: boolean }>;
  /** Whether channel data exists; when it does not, that paragraph may be empty. */
  hasChannels: boolean;
}

const WORD_LIMITS = {
  executiveSummary: 130,
  whatWeHeard: 170,
  channelsNarrative: 90,
  bottomLine: 90,
  dimensionText: 70,
} as const;

const GENDERED = /\b(he|she|him|her|his|hers|himself|herself)\b/i;
const THIRD_PERSON = /\bparticipants?\b/i;
const SCORE_WORDS = /percentile|\bscore[sd]?\b|\b\d{1,3}\s*(\/|out of)\s*100\b|\brank(ed|ing)?\b/i;
const COACHING = /\byou (should|must|need to|have to)\b/i;
/** Claims of proof or cause; the report only ever describes patterns, it does not prove them. */
const PROOF = /\b(proves?|proven|definitely|clearly caused|because of this)\b/i;

/** Every run of digits (allowing decimals) in a string, as written. */
export function extractNumbers(text: string): string[] {
  return text.match(/\d+(?:\.\d+)?/g) ?? [];
}

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** Participant-facing text built by code from the ledger (table cells, context, the priority). Same pronoun rules as the narrative. */
export function checkReportText(items: Array<{ where: string; text: string | null }>): string[] {
  const violations: string[] = [];
  for (const { where, text } of items) {
    if (!text) continue;
    if (GENDERED.test(text)) violations.push(`${where} uses a gendered pronoun`);
    if (THIRD_PERSON.test(text)) violations.push(`${where} says "the participant"`);
  }
  return [...new Set(violations)];
}

export function checkNarrative(text: NarrativeText, expect: NarrativeExpectations): string[] {
  const violations: string[] = [];
  const fields: Array<[string, string, number]> = [
    ["executiveSummary", text.executiveSummary, WORD_LIMITS.executiveSummary],
    ["whatWeHeard", text.whatWeHeard, WORD_LIMITS.whatWeHeard],
    ["channelsNarrative", text.channelsNarrative, WORD_LIMITS.channelsNarrative],
    ["bottomLine", text.bottomLine, WORD_LIMITS.bottomLine],
    ...text.dimensions.flatMap((d): Array<[string, string, number]> => [
      [`${d.id}.strengthText`, d.strengthText, WORD_LIMITS.dimensionText],
      [`${d.id}.improvementText`, d.improvementText, WORD_LIMITS.dimensionText],
    ]),
  ];

  for (const [name, value, limit] of fields) {
    if (wordCount(value) > limit) violations.push(`${name} is over ${limit} words`);
    if (GENDERED.test(value))
      violations.push(`${name} uses a gendered pronoun; address the reader as "you"`);
    if (THIRD_PERSON.test(value))
      violations.push(`${name} says "the participant"; address the reader as "you"`);
    if (SCORE_WORDS.test(value)) violations.push(`${name} mentions a score, rank, or percentile`);
    if (COACHING.test(value))
      violations.push(`${name} uses "you should/must/need to"; describe, do not instruct`);
    if (PROOF.test(value))
      violations.push(`${name} claims proof or cause; state it as an observation`);
    for (const number of extractNumbers(value)) {
      if (!expect.allowedNumbers.has(number))
        violations.push(`${name} contains the number ${number}, which is not in the data`);
    }
  }

  for (const required of ["executiveSummary", "whatWeHeard", "bottomLine"] as const) {
    if (!text[required].trim()) violations.push(`${required} is empty`);
  }
  if (expect.hasChannels && !text.channelsNarrative.trim())
    violations.push("channelsNarrative is empty but channel data exists");

  for (const wanted of expect.dimensions) {
    const got = text.dimensions.find((d) => d.id === wanted.id);
    if (!got) {
      violations.push(`missing text for dimension ${wanted.id}`);
      continue;
    }
    if (wanted.hasStrength && !got.strengthText.trim())
      violations.push(`${wanted.id}.strengthText is empty`);
    if (!wanted.hasStrength && got.strengthText.trim())
      violations.push(`${wanted.id}.strengthText must be empty (no strength was identified)`);
    if (wanted.hasImprovement && !got.improvementText.trim())
      violations.push(`${wanted.id}.improvementText is empty`);
    if (!wanted.hasImprovement && got.improvementText.trim())
      violations.push(
        `${wanted.id}.improvementText must be empty (no improvement area was identified)`,
      );
  }

  return [...new Set(violations)];
}
