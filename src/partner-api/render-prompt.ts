/**
 * Fills the tokens in a partner study's prompt, opening line and closing
 * question (partner-api-phase1/UI-PARTNER-API-SPEC.md, section 4). Only partner
 * studies use this; existing custom prompts keep their own simple substitution.
 *
 * Tokens: `{{subject_name}}`, `{{colleague_first_name}}`, `{{work_context}}`,
 * `{{target_minutes}}`, `{{hard_stop_minutes}}`, and any other context key as
 * `{{context.<key>}}`. A token with no value becomes an empty string, and
 * `{{#if token}}…{{/if}}` keeps its content only when the token has a value.
 *
 * The values come from outside (a colleague's name, a free-text description of
 * how they know the job seeker), so they are treated as data:
 * - line breaks and control characters become spaces, so a value cannot start
 *   a new paragraph, heading or list in the prompt;
 * - braces are removed, so a value cannot contain a token and is never
 *   re-scanned;
 * - free-text values are wrapped in quotation marks in the prompt, which marks
 *   where the data starts and ends;
 * - each value is capped in length.
 * Whatever the template contains, no literal `{{…}}` is left in the output.
 */

export const MAX_CONTEXT_VALUE_LENGTH = 1000;
export const MAX_TEMPLATE_LENGTH = 20_000;

export type RenderMode = "prompt" | "spoken";

const TOKEN = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;
const INNERMOST_IF = /\{\{#if\s+([A-Za-z0-9_.]+)\s*\}\}((?:(?!\{\{#if)[\s\S])*?)\{\{\/if\}\}/;
const LEFTOVER_TAG = /\{\{[^{}]*\}\}/g;

/** Makes an outside value safe to place in a prompt: one line, no braces, capped. */
export function sanitizeValue(value: unknown, max = MAX_CONTEXT_VALUE_LENGTH): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

export interface PromptValues {
  subjectName: string | null;
  colleagueFirstName: string;
  context: Record<string, string>;
  targetMinutes: number;
  hardStopMinutes: number;
}

/** The token table for one interview, with every outside value sanitized. */
export function buildTokenValues(values: PromptValues): Record<string, string> {
  const tokens: Record<string, string> = {
    subject_name: sanitizeValue(values.subjectName, 200),
    colleague_first_name: sanitizeValue(values.colleagueFirstName, 100),
    target_minutes: String(values.targetMinutes),
    hard_stop_minutes: String(values.hardStopMinutes),
  };
  for (const [key, raw] of Object.entries(values.context)) {
    const value = sanitizeValue(raw);
    tokens[`context.${key}`] = value;
    if (key === "workContext") tokens.work_context = value;
  }
  return tokens;
}

/** Tokens whose value is free text from outside, and so is delimited in a prompt. */
const isFreeText = (token: string) => token === "work_context" || token.startsWith("context.");

export function renderTemplate(
  template: string,
  tokens: Record<string, string>,
  mode: RenderMode = "prompt",
): string {
  let text = template;

  // Conditionals first, innermost out, so a nested block resolves before the one around it.
  for (let guard = 0; guard < 200; guard++) {
    const match = INNERMOST_IF.exec(text);
    if (!match) break;
    const [whole, token, inner] = match;
    text = text.replace(whole, () => (tokens[token] ? inner : ""));
  }

  text = text.replace(TOKEN, (_whole, token: string) => {
    const value = tokens[token] ?? "";
    if (!value) return "";
    return mode === "prompt" && isFreeText(token) ? `“${value}”` : value;
  });

  // An unclosed or unknown tag must not reach the model, or be spoken.
  return text.replace(LEFTOVER_TAG, "").replace(/\{\{|\}\}/g, "");
}

/** Problems with a prompt template the partner sent, as messages; empty when it is usable. */
export function validateTemplate(template: string, label: string): string[] {
  const errors: string[] = [];
  if (template.length > MAX_TEMPLATE_LENGTH) {
    errors.push(`${label} is longer than ${MAX_TEMPLATE_LENGTH} characters`);
  }
  let depth = 0;
  for (const tag of template.match(/\{\{\s*(#if\b[^}]*|\/if)\s*\}\}/g) ?? []) {
    depth += tag.includes("#if") ? 1 : -1;
    if (depth < 0) {
      errors.push(`${label} has a {{/if}} with no matching {{#if}}`);
      return errors;
    }
  }
  if (depth !== 0) errors.push(`${label} has a {{#if}} with no matching {{/if}}`);
  return errors;
}
