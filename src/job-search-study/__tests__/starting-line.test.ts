import { describe, expect, it } from "vitest";
import { analyzeChannels, buildComparisonRows, buildStartingLine } from "../report/analysis";
import type { ApplicationProfile, Comparison } from "../ledger/types";
import { loadRubric } from "../rubric/rubric";
import { blankLedger } from "./ledger-helpers";

const rubric = loadRubric();

const profile = (overrides: Partial<ApplicationProfile> = {}): ApplicationProfile => ({
  description: "A job board application",
  source: "cold_application",
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

function ledgerWith(options: {
  total?: number | null;
  sources?: Array<{
    source: "recruiter_inbound" | "cold_application" | "referral_from_contact";
    count: number | null;
  }>;
  typical?: ApplicationProfile | null;
}) {
  const ledger = blankLedger(rubric);
  ledger.facts.totalConversations = options.total ?? null;
  ledger.facts.sources = options.sources ?? [];
  ledger.comparison.typical = options.typical ?? null;
  return ledger;
}

describe("buildStartingLine", () => {
  it("collects the baseline numbers the participant gave, in a fixed order", () => {
    const ledger = ledgerWith({
      total: 5,
      sources: [
        { source: "recruiter_inbound", count: 2 },
        { source: "cold_application", count: 3 },
      ],
      typical: profile({ timeNote: "10 to 15 minutes", postingAge: "about a week" }),
    });

    const rows = buildStartingLine(
      {
        channels_used: [
          "General job boards (such as LinkedIn or Indeed)",
          "Job alerts or saved searches",
          "Referrals from people I know",
        ],
        applications_30d: "31 to 50",
        conversations_total: "3 to 5",
      },
      ledger,
      analyzeChannels(ledger.facts),
    );

    expect(rows).toEqual([
      {
        label: "Where you look for openings",
        value: "General job boards (such as LinkedIn or Indeed); Job alerts or saved searches",
        origin: "screener",
      },
      {
        label: "Applications in the past month",
        value: "31 to 50 (your estimate)",
        origin: "screener",
      },
      { label: "Recruiter conversations or interviews so far", value: "5", origin: "interview" },
      {
        label: "Where those conversations came from",
        value: "Cold applications: 3; Recruiters who reached out to you: 2",
        origin: "interview",
      },
      {
        label: "Time you usually spend on an application",
        value: "10 to 15 minutes",
        origin: "interview",
      },
      { label: "How old a role was when you applied", value: "about a week", origin: "interview" },
    ]);
  });

  it("falls back to the screener's range for conversations, marked as an estimate", () => {
    const ledger = ledgerWith({});

    const rows = buildStartingLine(
      { conversations_total: "3 to 5" },
      ledger,
      analyzeChannels(ledger.facts),
    );

    expect(rows).toEqual([
      {
        label: "Recruiter conversations or interviews so far",
        value: "3 to 5 (your estimate)",
        origin: "screener",
      },
    ]);
  });

  it("leaves out anything that was not collected, and never computes a rate", () => {
    const ledger = ledgerWith({ typical: profile({ timeMinutes: 20 }) });

    const rows = buildStartingLine(null, ledger, analyzeChannels(ledger.facts));

    expect(rows).toEqual([
      {
        label: "Time you usually spend on an application",
        value: "About 20 minutes",
        origin: "interview",
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/%|per application|ratio/i);
  });

  it("ignores screener sources that are about people, and old single-option answers", () => {
    const ledger = ledgerWith({});

    const rows = buildStartingLine(
      {
        channels_used: [
          "Referrals from people I know",
          "Applying through job boards or company career sites",
        ],
      },
      ledger,
      analyzeChannels(ledger.facts),
    );

    expect(rows).toEqual([]);
  });

  it("is empty with nothing to go on", () => {
    const ledger = ledgerWith({});

    expect(buildStartingLine(null, ledger, analyzeChannels(ledger.facts))).toEqual([]);
  });
});

describe("posting age in the comparison rows", () => {
  it("shows how old the posting was for each side when known", () => {
    const comparison: Comparison = {
      typical: profile({ postingAge: "a few days" }),
      successful: profile({ source: "referral_from_contact", postingAge: "about a week" }),
      successfulIsFurthestProgressOnly: false,
      describedApplicationIsTypical: null,
      participantExplanation: null,
    };

    const rows = buildComparisonRows(comparison);

    expect(rows.find((row) => row.label === "How old the posting was when you applied")).toEqual({
      label: "How old the posting was when you applied",
      typical: "a few days",
      successful: "about a week",
    });
  });
});
