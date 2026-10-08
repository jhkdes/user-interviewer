import { describe, expect, it } from "vitest";
import { fromWireLedger } from "../ledger/wire";
import { loadRubric } from "../rubric/rubric";
import { blankLedger, toWireLedger, withEntry } from "./ledger-helpers";

const rubric = loadRubric();

describe("fromWireLedger", () => {
  it("round-trips a ledger through the wire format", () => {
    let ledger = blankLedger(rubric);
    ledger = withEntry(ledger, {
      id: "F2",
      status: "rated",
      score: 3,
      evidenceBasis: "estimated_pattern",
      subSignals: [{ name: "match rate", observation: "most" }],
      quotes: [{ turnIndex: 3, text: "most of them" }],
      confidenceNote: "Conflicts with the screener",
      trajectoryNote: null,
      statusReason: null,
    });
    ledger.facts = {
      targetSummary: "Enterprise B2B product roles",
      matchRate: { matched: 14, outOf: 20, basis: "estimated_pattern" },
      totalConversations: 5,
      sources: [{ source: "recruiter_inbound", count: 2 }],
      effortSplit: [
        { source: "cold_application", sharePercent: null, qualitative: "mostly talking to people" },
      ],
      volunteeredContext: ["side project"],
    };
    ledger.comparison = {
      typical: {
        description: "Fin-tech role in Concord",
        source: "cold_application",
        fit: null,
        timeMinutes: 12,
        timeNote: "10 to 15 minutes",
        postingAge: null,
        research: null,
        positioning: "Reused one of three resumes",
        humanContact: null,
        aiUse: null,
        followUp: null,
      },
      successful: null,
      successfulIsFurthestProgressOnly: false,
      describedApplicationIsTypical: true,
      participantExplanation: "A direct referral",
    };
    ledger.reportPriority = { text: "How to get interviews", turnIndex: 13 };
    ledger.conflicts = [{ description: "Volume mismatch", turnIndexes: [5] }];

    const expected = { ...ledger } as Partial<typeof ledger>;
    delete expected.rubricVersion;

    expect(fromWireLedger(toWireLedger(ledger))).toEqual(expected);
  });

  it("turns the schema's empty values into nulls", () => {
    const wire = toWireLedger(blankLedger(rubric));

    const ledger = fromWireLedger(wire);

    expect(ledger.behaviors[0]).toMatchObject({
      score: null,
      evidenceBasis: null,
      confidenceNote: null,
    });
    expect(ledger.facts.matchRate).toEqual({ matched: null, outOf: null, basis: null });
    expect(ledger.facts.totalConversations).toBeNull();
    expect(ledger.comparison.typical).toBeNull();
    expect(ledger.comparison.describedApplicationIsTypical).toBeNull();
    expect(ledger.reportPriority).toBeNull();
  });

  it("maps yes and no to booleans", () => {
    const yes = toWireLedger(blankLedger(rubric));
    yes.comparison.describedApplicationIsTypical = "yes";
    const no = toWireLedger(blankLedger(rubric));
    no.comparison.describedApplicationIsTypical = "no";

    expect(fromWireLedger(yes).comparison.describedApplicationIsTypical).toBe(true);
    expect(fromWireLedger(no).comparison.describedApplicationIsTypical).toBe(false);
  });

  it("treats placeholder text in the comparison table as nothing, but keeps real status reasons", () => {
    const wire = toWireLedger(blankLedger(rubric));
    wire.comparison.typical = [
      {
        description: "A job board application",
        source: "cold_application",
        fit: "None",
        timeMinutes: -1,
        timeNote: "Not described.",
        postingAge: "",
        research: "N/A",
        positioning: "Same resume as usual",
        humanContact: "None mentioned",
        aiUse: "",
        followUp: "Unknown",
      },
    ];

    const profile = fromWireLedger(wire).comparison.typical!;

    expect(profile).toMatchObject({
      fit: null,
      timeNote: null,
      research: null,
      humanContact: null,
      aiUse: null,
      followUp: null,
    });
    expect(profile.positioning).toBe("Same resume as usual");
    expect(fromWireLedger(wire).behaviors[0].statusReason).toBe("Not discussed");
  });

  it("treats a blank report priority as none", () => {
    const wire = toWireLedger(blankLedger(rubric));
    wire.reportPriority = [{ text: "  ", turnIndex: 4 }];

    expect(fromWireLedger(wire).reportPriority).toBeNull();
  });

  it("tolerates a model that omits optional sections", () => {
    const ledger = fromWireLedger({ behaviors: [] });

    expect(ledger.behaviors).toEqual([]);
    expect(ledger.facts.sources).toEqual([]);
    expect(ledger.comparison.typical).toBeNull();
  });
});
