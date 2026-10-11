import { describe, expect, it } from "vitest";
import { analyzeChannels, buildComparisonRows, buildContextRows } from "../report/analysis";
import type { ApplicationProfile, Comparison, ExtractedFacts } from "../ledger/types";
import { loadRubric } from "../rubric/rubric";
import { blankLedger } from "./ledger-helpers";

const rubric = loadRubric();

const facts = (overrides: Partial<ExtractedFacts> = {}): ExtractedFacts => ({
  targetSummary: null,
  matchRate: { matched: null, outOf: null, basis: null },
  totalConversations: null,
  sources: [],
  effortSplit: [],
  supportProviders: [],
  volunteeredContext: [],
  ...overrides,
});

describe("analyzeChannels", () => {
  it("builds rows with counts and shares, most results first", () => {
    const result = analyzeChannels(
      facts({
        totalConversations: 5,
        sources: [
          { source: "cold_application", count: 2 },
          { source: "recruiter_inbound", count: 2 },
          { source: "referral_from_contact", count: 1 },
        ],
      }),
    );

    expect(result.totalInterviews).toBe(5);
    expect(result.rows.map((r) => [r.source, r.interviews, r.interviewSharePercent])).toEqual([
      ["cold_application", 2, 40],
      ["recruiter_inbound", 2, 40],
      ["referral_from_contact", 1, 20],
    ]);
    expect(result.mismatches).toEqual([]);
  });

  it("uses the sum of source counts when no total was given", () => {
    const result = analyzeChannels(
      facts({
        sources: [
          { source: "cold_application", count: 3 },
          { source: "referral_from_contact", count: 1 },
        ],
      }),
    );

    expect(result.totalInterviews).toBe(4);
  });

  it("includes effort-only sources and keeps qualitative effort without comparing it", () => {
    const result = analyzeChannels(
      facts({
        totalConversations: 5,
        sources: [{ source: "cold_application", count: 5 }],
        effortSplit: [
          {
            source: "cold_application",
            sharePercent: null,
            qualitative: "opportunistically applying",
          },
          {
            source: "former_colleague_or_network",
            sharePercent: null,
            qualitative: "most of my time",
          },
        ],
      }),
    );

    expect(result.rows.map((r) => r.source)).toEqual([
      "cold_application",
      "former_colleague_or_network",
    ]);
    expect(result.rows[1]).toMatchObject({ interviews: null, effortNote: "most of my time" });
    expect(result.effortIsNumeric).toBe(false);
    expect(result.mismatches).toEqual([]);
  });

  it("flags effort far above results and results far above effort when effort is numeric", () => {
    const result = analyzeChannels(
      facts({
        totalConversations: 10,
        sources: [
          { source: "cold_application", count: 2 },
          { source: "referral_from_contact", count: 6 },
          { source: "recruiter_inbound", count: 2 },
        ],
        effortSplit: [
          { source: "cold_application", sharePercent: 65, qualitative: null },
          { source: "referral_from_contact", sharePercent: 15, qualitative: null },
          { source: "recruiter_inbound", sharePercent: 20, qualitative: null },
        ],
      }),
    );

    expect(result.effortIsNumeric).toBe(true);
    // Listed in table order: most interviews first.
    expect(result.mismatches).toEqual([
      {
        kind: "yield_exceeds_effort",
        source: "referral_from_contact",
        interviewSharePercent: 60,
        effortPercent: 15,
      },
      {
        kind: "effort_exceeds_yield",
        source: "cold_application",
        interviewSharePercent: 20,
        effortPercent: 65,
      },
    ]);
  });

  it("handles no data at all", () => {
    expect(analyzeChannels(facts())).toEqual({
      rows: [],
      totalInterviews: null,
      effortIsNumeric: false,
      mismatches: [],
    });
  });
});

describe("buildComparisonRows", () => {
  const profile = (overrides: Partial<ApplicationProfile> = {}): ApplicationProfile => ({
    description: "x",
    source: null,
    fit: null,
    timeMinutes: null,
    timeNote: null,
    postingAge: null,
    research: null,
    positioning: null,
    humanContact: null,
    aiUse: null,
    followUp: null,
    ...overrides,
  });
  const comparison = (
    typical: ApplicationProfile | null,
    successful: ApplicationProfile | null,
  ): Comparison => ({
    typical,
    successful,
    successfulIsFurthestProgressOnly: false,
    describedApplicationIsTypical: null,
    participantExplanation: null,
  });

  it("shows only rows that have something on at least one side", () => {
    const rows = buildComparisonRows(
      comparison(
        profile({ source: "cold_application", timeMinutes: 12, timeNote: "10 to 15 minutes" }),
        profile({
          source: "referral_from_contact",
          humanContact: "Introduced by a former colleague",
        }),
      ),
    );

    expect(rows).toEqual([
      {
        label: "How it started",
        typical: "Cold applications",
        successful: "Referral or introduction from someone you know",
      },
      { label: "Time invested", typical: "10 to 15 minutes", successful: null },
      { label: "Human contact", typical: null, successful: "Introduced by a former colleague" },
    ]);
  });

  it("falls back to minutes when there is no wording for the time", () => {
    const rows = buildComparisonRows(comparison(profile({ timeMinutes: 30 }), null));

    expect(rows).toEqual([
      { label: "Time invested", typical: "About 30 minutes", successful: null },
    ]);
  });

  it("is empty when neither side was described", () => {
    expect(buildComparisonRows(comparison(null, null))).toEqual([]);
  });
});

describe("buildContextRows", () => {
  it("includes only the screener answers that exist, marked as self-reported where needed", () => {
    const ledger = blankLedger(rubric);

    const rows = buildContextRows(
      {
        search_duration: "1 to 3 months",
        applications_30d: "31 to 50",
        ai_uses: ["Tailoring my resume"],
      },
      ledger,
    );

    expect(rows).toEqual([
      { label: "Time searching", value: "1 to 3 months", origin: "screener" },
      {
        label: "Applications in the past month",
        value: "31 to 50 (your estimate)",
        origin: "screener",
      },
    ]);
  });

  it("adds what the participant volunteered, and nothing about energy or pressure otherwise", () => {
    const ledger = blankLedger(rubric);
    ledger.facts.volunteeredContext = ["Got sidetracked by a side project"];

    const rows = buildContextRows(null, ledger);

    expect(rows).toEqual([
      { label: "You mentioned", value: "Got sidetracked by a side project", origin: "interview" },
    ]);
  });

  it("drops volunteered items that merely restate a screener answer", () => {
    const ledger = blankLedger(rubric);
    ledger.facts.volunteeredContext = [
      "recently out of full-time role (less than 3 months)",
      "actively searching for 1 to 3 months",
      "got sidetracked by a side project",
    ];

    const rows = buildContextRows(
      { time_since_full_time: "Less than 3 months", search_duration: "1 to 3 months" },
      ledger,
    );

    expect(rows.filter((r) => r.origin === "interview")).toEqual([
      { label: "You mentioned", value: "got sidetracked by a side project", origin: "interview" },
    ]);
  });

  it("is empty with no screener and nothing volunteered", () => {
    expect(buildContextRows(null, blankLedger(rubric))).toEqual([]);
  });
});
