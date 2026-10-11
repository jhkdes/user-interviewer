import type { InterviewTurn } from "@/llm";
import { buildLedgerSchema } from "../ledger/schema";
import { fromWireLedger } from "../ledger/wire";
import type { EvidenceLedger } from "../ledger/types";
import { validateLedger, type LedgerIssue } from "../ledger/validate";
import { loadRubric, type Rubric } from "../rubric/rubric";
import { buildExtractionSystemPrompt, buildExtractionUserMessage } from "./prompt";

/**
 * One structured-output LLM call: send a system prompt and a user message,
 * get back the parsed JSON object that conforms to `schema`. Kept as a plain
 * function type so extraction can be tested without an API, and so it does not
 * widen the shared LLMProviderAdapter interface every study depends on.
 */
export type StructuredCompletion = (args: {
  system: string;
  user: string;
  schema: object;
  maxTokens: number;
  /** Name for the forced tool call that carries the output. Defaults to "record_evidence". */
  toolName?: string;
}) => Promise<unknown>;

export interface ExtractionInput {
  transcript: InterviewTurn[];
  screenerAnswers: Record<string, string | string[]> | null;
}

export interface ExtractionResult {
  /** The cleaned ledger from the last attempt (unverifiable quotes dropped). */
  ledger: EvidenceLedger;
  issues: LedgerIssue[];
  /** True when the final attempt had no errors. */
  ok: boolean;
  attempts: number;
}

export interface ExtractionDeps {
  complete: StructuredCompletion;
  rubric?: Rubric;
  /** How many times to try before giving up on a ledger with errors. Default 2. */
  maxAttempts?: number;
}

const MAX_OUTPUT_TOKENS = 12000;

/** Checks the model's raw (wire-format) output has the top-level sections before converting it. */
function isLedgerShaped(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.behaviors) &&
    typeof candidate.facts === "object" &&
    typeof candidate.comparison === "object" &&
    Array.isArray(candidate.conflicts)
  );
}

/**
 * Reads one interview against the rubric and returns a validated evidence
 * ledger. If the model's output has errors the JSON schema cannot catch (a
 * missing behavior, a rated behavior with no verifiable quote), it tries again
 * and returns the last attempt either way, so the caller can decide what to do
 * with an `ok: false` result.
 */
export async function extractEvidence(
  deps: ExtractionDeps,
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const rubric = deps.rubric ?? loadRubric();
  const maxAttempts = deps.maxAttempts ?? 2;
  const system = buildExtractionSystemPrompt(rubric);
  const user = buildExtractionUserMessage(input);
  const schema = buildLedgerSchema(rubric);

  let last: ExtractionResult | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await deps.complete({ system, user, schema, maxTokens: MAX_OUTPUT_TOKENS });
    if (!isLedgerShaped(raw)) {
      last = {
        ledger: emptyLedger(rubric),
        issues: [{ severity: "error", message: "Extractor output was not shaped like a ledger" }],
        ok: false,
        attempts: attempt,
      };
      continue;
    }

    const validated = validateLedger(
      rubric,
      { ...fromWireLedger(raw), rubricVersion: rubric.version },
      input.transcript,
    );
    last = {
      ledger: validated.ledger,
      issues: validated.issues,
      ok: validated.ok,
      attempts: attempt,
    };
    if (validated.ok) return last;
  }

  return last!;
}

function emptyLedger(rubric: Rubric): EvidenceLedger {
  return {
    rubricVersion: rubric.version,
    behaviors: [],
    facts: {
      targetSummary: null,
      matchRate: { matched: null, outOf: null, basis: null },
      totalConversations: null,
      sources: [],
      effortSplit: [],
      volunteeredContext: [],
      supportProviders: [],
    },
    comparison: {
      typical: null,
      successful: null,
      successfulIsFurthestProgressOnly: false,
      describedApplicationIsTypical: null,
      participantExplanation: null,
    },
    reportPriority: null,
    conflicts: [],
  };
}
