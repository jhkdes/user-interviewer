import { describe, expect, it, vi } from "vitest";
import { aggregateRuns } from "../ledger/aggregate";
import type { BehaviorEvidence } from "../ledger/types";
import {
  checkNarrative,
  extractNumbers,
  type NarrativeExpectations,
  type NarrativeText,
} from "../report/check-narrative";
import { analyzeChannels, buildContextRows, buildStartingLine } from "../report/analysis";
import {
  buildNarrativePack,
  generateNarrative,
  NARRATIVE_SYSTEM_PROMPT,
} from "../report/narrative";
import { loadRubric, type BehaviorId, type Score } from "../rubric/rubric";
import { scoreLedger } from "../scoring/score";
import { blankLedger, withEntry } from "./ledger-helpers";

const rubric = loadRubric();

const goodNarrative = (overrides: Partial<NarrativeText> = {}): NarrativeText => ({
  executiveSummary: "You have a clear target. Your conversations mostly came from people.",
  whatWeHeard: "You are looking for enterprise product roles.",
  channelsNarrative: "",
  bottomLine: "The most useful idea is to build on what is working.",
  dimensions: [
    { id: "focus", strengthText: "Your target is clear.", improvementText: "" },
    { id: "pitch", strengthText: "", improvementText: "Your applications look alike." },
    { id: "reach", strengthText: "", improvementText: "" },
    { id: "learn", strengthText: "", improvementText: "" },
  ],
  ...overrides,
});

const expectations = (overrides: Partial<NarrativeExpectations> = {}): NarrativeExpectations => ({
  allowedNumbers: new Set(["5", "2"]),
  dimensions: [
    { id: "focus", hasStrength: true, hasImprovement: false },
    { id: "pitch", hasStrength: false, hasImprovement: true },
    { id: "reach", hasStrength: false, hasImprovement: false },
    { id: "learn", hasStrength: false, hasImprovement: false },
  ],
  hasChannels: false,
  ...overrides,
});

describe("extractNumbers", () => {
  it("finds integers and decimals", () => {
    expect(extractNumbers("About 5 of 20, or 92.5 percent, in 2 weeks")).toEqual([
      "5",
      "20",
      "92.5",
      "2",
    ]);
  });
});

describe("checkNarrative", () => {
  it("accepts a clean narrative", () => {
    expect(checkNarrative(goodNarrative(), expectations())).toEqual([]);
  });

  it("rejects a number that is not in the data", () => {
    const text = goodNarrative({ executiveSummary: "You had 7 conversations." });

    expect(checkNarrative(text, expectations())).toEqual([
      "executiveSummary contains the number 7, which is not in the data",
    ]);
  });

  it("allows numbers that are in the data", () => {
    expect(
      checkNarrative(
        goodNarrative({ executiveSummary: "You counted 5 conversations, 2 from recruiters." }),
        expectations(),
      ),
    ).toEqual([]);
  });

  it("rejects gendered pronouns and 'the participant'", () => {
    const messages = checkNarrative(
      goodNarrative({
        executiveSummary: "He has a clear target.",
        whatWeHeard: "The participant wants product roles.",
      }),
      expectations(),
    ).join("\n");

    expect(messages).toMatch(/executiveSummary uses a gendered pronoun/);
    expect(messages).toMatch(/whatWeHeard says "the participant"/);
  });

  it("rejects scores, ranks, and percentiles", () => {
    expect(
      checkNarrative(
        goodNarrative({ bottomLine: "You are in the 80th percentile." }),
        expectations(),
      ).join("\n"),
    ).toMatch(/mentions a score, rank, or percentile/);
    expect(
      checkNarrative(goodNarrative({ bottomLine: "Your score is high." }), expectations()).join(
        "\n",
      ),
    ).toMatch(/score/);
  });

  it("rejects instructions", () => {
    expect(
      checkNarrative(
        goodNarrative({ bottomLine: "You should apply to fewer roles." }),
        expectations(),
      ).join("\n"),
    ).toMatch(/describe, do not instruct/);
  });

  it("requires the main sections", () => {
    const messages = checkNarrative(goodNarrative({ whatWeHeard: " " }), expectations());

    expect(messages).toContain("whatWeHeard is empty");
  });

  it("requires channel text only when channel data exists", () => {
    const text = goodNarrative();

    expect(checkNarrative(text, expectations())).toEqual([]);
    expect(checkNarrative(text, expectations({ hasChannels: true }))).toEqual([
      "channelsNarrative is empty but channel data exists",
    ]);
  });

  it("rejects claims of proof or cause", () => {
    const text = goodNarrative({ bottomLine: "This proves the referral worked." });

    expect(checkNarrative(text, expectations()).join("\n")).toMatch(
      /bottomLine claims proof or cause/,
    );
  });

  it("requires text for a chosen strength or improvement and forbids it otherwise", () => {
    const missing = goodNarrative({
      dimensions: [
        { id: "focus", strengthText: "", improvementText: "" },
        { id: "pitch", strengthText: "", improvementText: "" },
        { id: "reach", strengthText: "Made-up strength.", improvementText: "" },
        { id: "learn", strengthText: "", improvementText: "" },
      ],
    });

    const messages = checkNarrative(missing, expectations());

    expect(messages).toContain("focus.strengthText is empty");
    expect(messages).toContain("pitch.improvementText is empty");
    expect(messages).toContain("reach.strengthText must be empty (no strength was identified)");
  });

  it("flags text over the length limit", () => {
    const long = Array(200).fill("word").join(" ");

    expect(checkNarrative(goodNarrative({ bottomLine: long }), expectations())).toContain(
      "bottomLine is over 90 words",
    );
  });
});

function rated(id: BehaviorId, score: Score, note = "something observed"): BehaviorEvidence {
  return {
    id,
    status: "rated",
    score,
    evidenceBasis: "concrete_example",
    subSignals: [{ name: "a sub-signal", observation: note }],
    quotes: [{ turnIndex: 1, text: "x" }],
    confidenceNote: null,
    trajectoryNote: null,
    statusReason: null,
  };
}

function buildPack() {
  let ledger = blankLedger(rubric);
  for (const [id, score] of Object.entries({
    F1: 4,
    F2: 4,
    F3: 3,
    P1: 1,
    P2: 1,
    P3: 3,
    R1: 3,
    R2: 2,
    L1: 3,
    L2: 3,
    L3: 3,
  })) {
    ledger = withEntry(ledger, rated(id as BehaviorId, score as Score));
  }
  ledger.facts.totalConversations = 5;
  ledger.facts.sources = [
    { source: "recruiter_inbound", count: 2 },
    { source: "cold_application", count: 3 },
  ];
  ledger.facts.targetSummary = "Enterprise B2B product roles";
  ledger.reportPriority = { text: "How to get more interviews", turnIndex: 13 };
  const aggregate = aggregateRuns(rubric, [ledger]);
  const scoring = scoreLedger(rubric, aggregate);
  ledger.comparison.typical = {
    description: "A job board application",
    source: "cold_application",
    fit: null,
    timeMinutes: 12,
    timeNote: "10 to 15 minutes",
    postingAge: null,
    research: null,
    positioning: "Used one of three resumes",
    humanContact: null,
    aiUse: null,
    followUp: null,
  };
  ledger.comparison.successful = {
    description: "A referral to a legal-tech company",
    source: "referral_from_contact",
    fit: "Overlap with e-discovery experience",
    timeMinutes: null,
    timeNote: null,
    postingAge: "about a week",
    research: null,
    positioning: null,
    humanContact: "Introduced by a former colleague",
    aiUse: null,
    followUp: null,
  };
  ledger.comparison.participantExplanation = "It was a direct referral";
  const channels = analyzeChannels(ledger.facts);
  const screener = { search_duration: "1 to 3 months", applications_30d: "31 to 50" };
  const startingLine = buildStartingLine(screener, ledger, channels);
  return buildNarrativePack({
    rubric,
    aggregate,
    scoring,
    startingLine,
    channels,
    context: buildContextRows(screener, ledger),
    experiments: [],
  });
}

describe("buildNarrativePack", () => {
  const pack = buildPack();

  it("carries bands and labels but never numeric scores", () => {
    const json = JSON.stringify(pack);

    expect(pack.dimensions.map((d) => [d.id, d.band])).toEqual([
      ["focus", "Strong"],
      ["pitch", "Opportunity"],
      ["reach", "Developing"],
      ["learn", "Strong"],
    ]);
    expect(json).not.toMatch(/"score"/);
    expect(json).not.toMatch(/\b92\.5\b/);
  });

  it("includes the strength and improvement behaviors with their evidence", () => {
    const pitch = pack.dimensions.find((d) => d.id === "pitch")!;

    expect(pitch.strength?.name).toBe("Uses AI where it helps, and checks it");
    expect(pitch.improvement?.evidence[0]).toMatch(/something observed/);
  });

  it("includes the participant's priority and counts", () => {
    expect(pack.priority).toBe("How to get more interviews");
    expect(pack.totalInterviews).toBe(5);
    expect(pack.context).toEqual([
      { label: "Time searching", value: "1 to 3 months" },
      { label: "Applications in the past month", value: "31 to 50 (your estimate)" },
    ]);
  });

  it("describes the typical application and the opportunity that led somewhere, with only the fields that have content", () => {
    expect(pack.typicalApplication).toEqual({
      "what it was": "A job board application",
      "how it started": "Cold applications",
      "minutes spent": 12,
      "time, in their words": "10 to 15 minutes",
      "how they positioned themselves": "Used one of three resumes",
    });
    expect(pack.successfulOpportunity).toMatchObject({
      "how it started": "Referral or introduction from someone you know",
      "how old the posting was when they applied": "about a week",
      "human contact": "Introduced by a former colleague",
    });
    expect(pack.successfulOpportunity).not.toHaveProperty("research");
    expect(pack.participantExplanation).toBe("It was a direct referral");
  });

  it("gives the writer the starting line so the prose agrees with the table", () => {
    expect(pack.startingLine.map((row) => row.label)).toEqual([
      "Applications in the past month",
      "Recruiter conversations or interviews so far",
      "Where those conversations came from",
      "Time you usually spend on an application",
    ]);
  });
});

describe("generateNarrative", () => {
  const pack = buildPack();
  const valid = (): NarrativeText => ({
    executiveSummary: "You have a clear target and a search shaped by conversations.",
    whatWeHeard: "You are looking for enterprise product roles and mostly talk to people.",
    channelsNarrative: "You counted 5 conversations in total.",
    bottomLine: "The idea that stands out is to build on what already works for you.",
    dimensions: pack.dimensions.map((d) => ({
      id: d.id as never,
      strengthText: d.strength ? "A short, grounded strength." : "",
      improvementText: d.improvement ? "A short, grounded area to build." : "",
    })),
  });

  it("returns a clean narrative on the first attempt", async () => {
    const complete = vi.fn().mockResolvedValue(valid());

    const result = await generateNarrative({ complete, rubric }, pack);

    expect(result.violations).toEqual([]);
    expect(result.attempts).toBe(1);
    const args = complete.mock.calls[0][0];
    expect(args.system).toBe(NARRATIVE_SYSTEM_PROMPT);
    expect(args.user).toContain("How to get more interviews");
    expect(args.toolName).toBe("write_report");
  });

  it("retries with feedback when the first draft breaks a rule", async () => {
    const bad = { ...valid(), executiveSummary: "He has 99 conversations." };
    const complete = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(valid());

    const result = await generateNarrative({ complete, rubric }, pack);

    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.violations).toEqual([]);
    expect(result.attempts).toBe(2);
    expect(complete.mock.calls[1][0].user).toMatch(/executiveSummary uses a gendered pronoun/);
    expect(complete.mock.calls[1][0].user).toMatch(/contains the number 99/);
  });

  it("returns the last draft with its violations when every attempt fails", async () => {
    const complete = vi.fn().mockResolvedValue({ ...valid(), bottomLine: "Your score is 80." });

    const result = await generateNarrative({ complete, rubric, maxAttempts: 2 }, pack);

    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.attempts).toBe(2);
  });

  it("treats output that is not narrative-shaped as a failure", async () => {
    const complete = vi.fn().mockResolvedValue({ nope: true });

    const result = await generateNarrative({ complete, rubric, maxAttempts: 1 }, pack);

    expect(result.violations).toEqual(["The writer's output was not shaped like a narrative"]);
  });
});
