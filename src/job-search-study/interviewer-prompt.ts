import { readFileSync } from "node:fs";
import path from "node:path";

const PROMPT_START_MARKER = "## PROMPT START";
const PROMPT_END_MARKER = "## PROMPT END";

/**
 * Pulls the interviewer prompt out of JOB_SEARCH_INTERVIEWER_PROMPT.md — the
 * text between the "PROMPT START" and "PROMPT END" markers. That markdown file
 * is the single source of truth (it also carries team notes that must never
 * reach the model), so scripts and tests read the prompt from it rather than
 * keeping a second copy.
 */
export function extractInterviewerPrompt(markdown: string): string {
  const start = markdown.indexOf(PROMPT_START_MARKER);
  const end = markdown.indexOf(PROMPT_END_MARKER);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `Expected "${PROMPT_START_MARKER}" followed by "${PROMPT_END_MARKER}" in the prompt file`,
    );
  }
  return markdown.slice(start + PROMPT_START_MARKER.length, end).trim();
}

/** Server/script-only (reads from disk) — never import from client or Next route code. */
export function loadJobSearchInterviewerPrompt(
  filePath: string = path.resolve(process.cwd(), "JOB_SEARCH_INTERVIEWER_PROMPT.md"),
): string {
  return extractInterviewerPrompt(readFileSync(filePath, "utf-8"));
}
