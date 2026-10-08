import { describe, expect, it, vi } from "vitest";
import { extractEvidence, type StructuredCompletion } from "../extraction/extract";
import {
  buildExtractionSystemPrompt,
  buildExtractionUserMessage,
  formatScreenerForExtraction,
} from "../extraction/prompt";
import { buildLedgerSchema } from "../ledger/schema";
import { loadRubric } from "../rubric/rubric";
import { blankLedger, SAMPLE_TRANSCRIPT, toWireLedger, withEntry } from "./ledger-helpers";

const rubric = loadRubric();

/** What the model returns: a ledger without rubricVersion. */
function modelOutput(overrides: Parameters<typeof withEntry>[1][] = []) {
  let ledger = blankLedger(rubric);
  for (const entry of overrides) ledger = withEntry(ledger, entry);
  return toWireLedger(ledger);
}

const ratedF2 = {
  id: "F2" as const,
  status: "rated" as const,
  score: 3 as const,
  evidenceBasis: "estimated_pattern" as const,
  subSignals: [],
  quotes: [{ turnIndex: 3, text: "most of them, at least the recent ones" }],
  confidenceNote: null,
  trajectoryNote: null,
  statusReason: null,
};

describe("extraction prompt", () => {
  const system = buildExtractionSystemPrompt(rubric);

  it("includes every behavior with all five anchors", () => {
    for (const behavior of rubric.behaviors) {
      expect(system).toContain(`### ${behavior.id}. ${behavior.name}`);
      for (const key of ["0", "1", "2", "3", "4"] as const) {
        expect(system).toContain(behavior.anchors[key]);
      }
    }
  });

  it("tells the model how to treat the three no-score situations and the evidence bases", () => {
    expect(system).toContain("insufficient_evidence");
    expect(system).toContain("not_applicable");
    expect(system).toContain("concrete_example");
    expect(system).toContain("Interviewer turns are questions and restatements, never evidence");
  });

  it("numbers transcript turns and labels speakers", () => {
    const user = buildExtractionUserMessage({
      screenerAnswers: null,
      transcript: SAMPLE_TRANSCRIPT,
    });

    expect(user).toContain("[0] Interviewer: Walk me through");
    expect(user).toContain("[1] Participant: So, uh, I found it on LinkedIn");
    expect(user).toContain("answered none of the screener questions");
  });

  it("renders screener answers with their question labels", () => {
    const text = formatScreenerForExtraction({
      applications_30d: "31 to 50",
      channels_used: ["Referrals from people I know", "Recruiters who contacted me"],
    });

    expect(text).toContain(
      "Roughly how many job applications have you submitted in the past month? 31 to 50",
    );
    expect(text).toContain("Referrals from people I know; Recruiters who contacted me");
  });
});

describe("ledger schema", () => {
  const schema = buildLedgerSchema(rubric);

  it("lists the rubric's behavior ids and evidence bases", () => {
    const behaviorId = schema.properties.behaviors.items.properties.id.enum;
    expect(behaviorId).toEqual(rubric.behaviors.map((b) => b.id));
    expect(schema.properties.behaviors.items.properties.evidenceBasis.enum).toEqual([
      "concrete_example",
      "estimated_pattern",
      "general_description",
      "self_rating",
      "none",
    ]);
    expect(schema.properties.behaviors.items.properties.score.enum).toEqual([-1, 0, 1, 2, 3, 4]);
  });

  it("requires every top-level section", () => {
    expect(schema.required).toEqual([
      "behaviors",
      "facts",
      "comparison",
      "reportPriority",
      "conflicts",
    ]);
  });
});

describe("extractEvidence", () => {
  const input = { transcript: SAMPLE_TRANSCRIPT, screenerAnswers: null };

  it("returns a validated ledger stamped with the rubric version", async () => {
    const complete: StructuredCompletion = vi.fn().mockResolvedValue(modelOutput([ratedF2]));

    const result = await extractEvidence({ complete }, input);

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.ledger.rubricVersion).toBe(rubric.version);
    expect(result.ledger.behaviors.find((b) => b.id === "F2")!.score).toBe(3);
  });

  it("sends the rubric prompt, the transcript, and the schema", async () => {
    const complete = vi.fn().mockResolvedValue(modelOutput());

    await extractEvidence({ complete }, input);

    const args = complete.mock.calls[0][0];
    expect(args.system).toContain("### F1. Has a defined target");
    expect(args.user).toContain("[3] Participant: Probably most of them");
    expect(args.schema).toBeDefined();
  });

  it("retries once when the first ledger has errors, and returns the good one", async () => {
    const fabricated = {
      ...ratedF2,
      quotes: [{ turnIndex: 3, text: "I apply to exactly twenty roles a week" }],
    };
    const complete = vi
      .fn()
      .mockResolvedValueOnce(modelOutput([fabricated]))
      .mockResolvedValueOnce(modelOutput([ratedF2]));

    const result = await extractEvidence({ complete }, input);

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("returns the last attempt with ok false when every attempt has errors", async () => {
    const fabricated = {
      ...ratedF2,
      quotes: [{ turnIndex: 3, text: "I apply to exactly twenty roles a week" }],
    };
    const complete = vi.fn().mockResolvedValue(modelOutput([fabricated]));

    const result = await extractEvidence({ complete, maxAttempts: 2 }, input);

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("treats output that is not ledger-shaped as an error", async () => {
    const complete = vi.fn().mockResolvedValue({ hello: "world" });

    const result = await extractEvidence({ complete, maxAttempts: 1 }, input);

    expect(result.ok).toBe(false);
    expect(result.issues[0].message).toMatch(/not shaped like a ledger/);
  });

  it("propagates a failed LLM call", async () => {
    const complete = vi.fn().mockRejectedValue(new Error("network"));

    await expect(extractEvidence({ complete }, input)).rejects.toThrow("network");
  });
});

describe("ledger schema limits", () => {
  it("has no nullable or union types, which Claude's structured outputs limit to 16", () => {
    const json = JSON.stringify(buildLedgerSchema(rubric));

    expect(json).not.toContain('"anyOf"');
    expect(json).not.toContain('"oneOf"');
    expect(json).not.toMatch(/"type":\[/);
  });
});
