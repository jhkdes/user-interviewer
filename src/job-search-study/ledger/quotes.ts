import type { InterviewTurn } from "@/llm";
import type { LedgerQuote } from "./types";

/**
 * Quote verification for the evidence ledger: every quote the extractor gives
 * must really appear in a participant turn of the transcript. Spoken
 * transcripts are full of filler ("uh", "um"), stutters ("I, I, I don't"),
 * abandoned word fragments ("I f- and, and it only"), and speech-to-text
 * quirks such as words run together ("forfinancial"), and models tend to tidy
 * those up when quoting. So matching ignores case, punctuation, filler words,
 * word fragments, and immediately repeated words, and falls back to comparing
 * with spaces removed so run-together words still match. It is deliberately
 * not a fuzzy match: every letter of the quote must be there, in order.
 */

const FILLER_WORDS = new Set(["uh", "um", "uhh", "umm", "er", "erm", "ah", "hmm", "mm", "mmm"]);

export function normalizeForMatch(text: string): string {
  const tokens = text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    // An abandoned word fragment: a short run of letters ending in a hyphen before a space ("s- do", "f- and").
    .replace(/\b[a-z]{1,8}-(?=\s)/g, " ")
    .replace(/[^a-z0-9']+/g, " ")
    .split(" ")
    .map((token) => token.replace(/^'+|'+$/g, ""))
    .filter((token) => token.length > 0 && !FILLER_WORDS.has(token));

  const collapsed: string[] = [];
  for (const token of tokens) {
    if (collapsed[collapsed.length - 1] !== token) collapsed.push(token);
  }
  return collapsed.join(" ");
}

const stripSpaces = (text: string) => text.replace(/ /g, "");

/** Compact (space-free) segments at least this long may match without word-boundary alignment. */
const LONG_SEGMENT_CHARS = 15;

/** True if every segment of the quote (split on "..." or an ellipsis) appears in the turn, in order. */
function turnContainsQuote(turnText: string, quoteText: string): boolean {
  const segments = quoteText
    // "..." and "[bracketed clarifications]" both stand for words that are not in the transcript.
    .split(/\.{3}|…|\[[^\]]*\]/)
    .map((segment) => normalizeForMatch(segment))
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return false;

  const turn = normalizeForMatch(turnText);

  // Whole words, in order.
  const haystack = ` ${turn} `;
  let from = 0;
  let matched = true;
  for (const segment of segments) {
    const at = haystack.indexOf(` ${segment} `, from);
    if (at === -1) {
      matched = false;
      break;
    }
    from = at + segment.length + 1;
  }
  if (matched) return true;

  // Fallback for run-together words in the transcript ("forfinancial"): compare
  // with spaces removed, but a match must still start and end on a word boundary
  // of the transcript, so "linked" does not match inside "linkedin".
  const tokens = turn.split(" ").filter((token) => token.length > 0);
  const compactTurn = tokens.join("");
  const wordStarts = new Set<number>();
  const wordEnds = new Set<number>();
  let offset = 0;
  for (const token of tokens) {
    wordStarts.add(offset);
    offset += token.length;
    wordEnds.add(offset);
  }

  from = 0;
  for (const segment of segments) {
    const compactSegment = stripSpaces(segment);
    let at = compactTurn.indexOf(compactSegment, from);
    // Short segments must align to word boundaries. A long segment cannot match
    // mid-word by accident, and may legitimately start inside a run-together
    // token ("butit's").
    const needsAlignment = compactSegment.length < LONG_SEGMENT_CHARS;
    while (
      at !== -1 &&
      needsAlignment &&
      !(wordStarts.has(at) && wordEnds.has(at + compactSegment.length))
    ) {
      at = compactTurn.indexOf(compactSegment, at + 1);
    }
    if (at === -1) return false;
    from = at + compactSegment.length;
  }
  return true;
}

export type QuoteVerification =
  | { status: "verified"; turnIndex: number }
  /** The quote is real but sits in a different participant turn than the one given. */
  | { status: "relocated"; turnIndex: number }
  | {
      status: "unverified";
      reason: "empty" | "turn_out_of_range" | "not_a_participant_turn" | "not_found";
    };

export function verifyQuote(transcript: InterviewTurn[], quote: LedgerQuote): QuoteVerification {
  if (normalizeForMatch(quote.text).length === 0) return { status: "unverified", reason: "empty" };

  const given = transcript[quote.turnIndex];
  if (given === undefined) {
    // A wrong index is recoverable if the words exist in exactly one participant turn.
    return relocate(transcript, quote, "turn_out_of_range");
  }
  if (given.speaker !== "participant") return relocate(transcript, quote, "not_a_participant_turn");
  if (turnContainsQuote(given.text, quote.text)) {
    return { status: "verified", turnIndex: quote.turnIndex };
  }
  return relocate(transcript, quote, "not_found");
}

function relocate(
  transcript: InterviewTurn[],
  quote: LedgerQuote,
  failure: "turn_out_of_range" | "not_a_participant_turn" | "not_found",
): QuoteVerification {
  const matches = transcript
    .map((turn, turnIndex) => ({ turn, turnIndex }))
    .filter(
      ({ turn }) => turn.speaker === "participant" && turnContainsQuote(turn.text, quote.text),
    );

  if (matches.length === 1) return { status: "relocated", turnIndex: matches[0].turnIndex };
  return { status: "unverified", reason: failure };
}
