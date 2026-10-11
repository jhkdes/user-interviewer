import { describe, expect, it, vi } from "vitest";
import { aggregateRuns } from "../ledger/aggregate";
import type { BehaviorEvidence } from "../ledger/types";
import { generateReport } from "../report/generate";
import { DIMENSION_EXPLAINERS, ladderSteps } from "../report/explainers";
import { escapeHtml, renderReportHtml } from "../report/render-html";
import { buildTldr } from "../report/tldr";
import type { Report } from "../report/types";
import { loadRubric, type BehaviorId, type Score } from "../rubric/rubric";
import { blankLedger, withEntry } from "./ledger-helpers";

const rubric = loadRubric();

function rated(id: BehaviorId, score: Score): BehaviorEvidence {
  return {
    id,
    status: "rated",
    score,
    evidenceBasis: "concrete_example",
    subSignals: [{ name: "x", observation: "observed something" }],
    quotes: [{ turnIndex: 1, text: "x" }],
    confidenceNote: null,
    trajectoryNote: null,
    statusReason: null,
  };
}

function buildAggregate() {
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
  ledger.reportPriority = { text: "How to get more human conversations", turnIndex: 13 };
  ledger.comparison.typical = {
    description: "A job board application",
    source: "cold_application",
    fit: null,
    timeMinutes: 12,
    timeNote: null,
    postingAge: null,
    research: null,
    positioning: null,
    humanContact: null,
    aiUse: null,
    followUp: null,
  };
  ledger.comparison.successful = {
    description: "A referral",
    source: "referral_from_contact",
    fit: null,
    timeMinutes: null,
    timeNote: null,
    postingAge: null,
    research: null,
    positioning: null,
    humanContact: "Introduced by a former colleague",
    aiUse: null,
    followUp: null,
  };
  return aggregateRuns(rubric, [ledger]);
}

const narrativeFor = () => ({
  executiveSummary: "You have a clear target.\n\nYour conversations come from people.",
  whatWeHeard: "You are looking for product roles.",
  channelsNarrative: "You counted 5 conversations.",
  bottomLine: "Build on what works.",
  dimensions: [
    { id: "focus", strengthText: "Your target is clear.", improvementText: "" },
    {
      id: "pitch",
      strengthText: "You use AI with care.",
      improvementText: "Your applications look alike.",
    },
    {
      id: "reach",
      strengthText: "You use more than job boards.",
      improvementText: "Asking for help feels hard.",
    },
    { id: "learn", strengthText: "You act on results.", improvementText: "" },
  ],
});

describe("generateReport", () => {
  const input = {
    rubric,
    aggregate: buildAggregate(),
    screenerAnswers: { search_duration: "1 to 3 months" },
  };

  it("builds the whole report from code plus one narrative call", async () => {
    const complete = vi.fn().mockResolvedValue(narrativeFor());

    const result = await generateReport({ complete }, input);

    expect(complete).toHaveBeenCalledTimes(1);
    expect(result.narrativeViolations).toEqual([]);
    const { report } = result;
    expect(report.priority).toBe("How to get more human conversations");
    expect(report.dimensions.map((d) => [d.id, d.band])).toEqual([
      ["focus", "Strong"],
      ["pitch", "Opportunity"],
      ["reach", "Developing"],
      ["learn", "Strong"],
    ]);
    expect(report.dimensions[2].strengthText).toBe("You use more than job boards.");
    expect(report.channels.rows.map((r) => r.label)).toContain("Cold applications");
    expect(report.context).toEqual([
      { label: "Time searching", value: "1 to 3 months", origin: "screener" },
    ]);
    // The reach priority lifts the relationships experiment level with Pitch's heaviest gap (150 each);
    // the tie falls back to rubric order. The boost itself is tested in experiments.test.ts.
    expect(report.experiments.map((e) => e.forBehavior)).toEqual(["P1", "R2", "P2"]);
  });

  it("labels behaviors for the participant", async () => {
    const result = await generateReport(
      { complete: vi.fn().mockResolvedValue(narrativeFor()) },
      input,
    );

    const pitch = result.report.dimensions.find((d) => d.id === "pitch")!;
    expect(pitch.behaviors.map((b) => [b.id, b.label])).toEqual([
      ["P1", "Opportunity"],
      ["P2", "Opportunity"],
      ["P3", "Doing well"],
    ]);
  });

  it("flags third-person or gendered wording in text built from the ledger", async () => {
    const aggregate = buildAggregate();
    aggregate.base.comparison.typical = {
      description: "A job board application",
      source: "cold_application",
      fit: null,
      timeMinutes: null,
      timeNote: "The participant said about ten minutes",
      postingAge: "A week, he thinks",
      research: null,
      positioning: null,
      humanContact: null,
      aiUse: null,
      followUp: null,
    };

    const result = await generateReport(
      { complete: vi.fn().mockResolvedValue(narrativeFor()) },
      { rubric, aggregate, screenerAnswers: null },
    );

    expect(result.textViolations).toEqual([
      'starting line "Time you usually spend on an application" says "the participant"',
      'starting line "How old a role was when you applied" uses a gendered pronoun',
    ]);
  });

  it("has no text violations for clean data", async () => {
    const result = await generateReport(
      { complete: vi.fn().mockResolvedValue(narrativeFor()) },
      input,
    );

    expect(result.textViolations).toEqual([]);
  });

  it("reports narrative violations that survive the retries", async () => {
    const bad = { ...narrativeFor(), bottomLine: "Your score is 99." };

    const result = await generateReport({ complete: vi.fn().mockResolvedValue(bad) }, input);

    expect(result.narrativeViolations.length).toBeGreaterThan(0);
    expect(result.narrativeAttempts).toBe(2);
  });
});

describe("renderReportHtml", () => {
  async function build(overrides: Partial<Report> = {}): Promise<Report> {
    const result = await generateReport(
      { complete: vi.fn().mockResolvedValue(narrativeFor()) },
      {
        rubric,
        aggregate: buildAggregate(),
        screenerAnswers: { search_duration: "1 to 3 months" },
      },
    );
    return { ...result.report, ...overrides };
  }

  it("escapes HTML in every field", async () => {
    const html = renderReportHtml(
      await build({ priority: "<script>alert(1)</script> & more", bottomLine: '5 < 6 "quoted"' }),
    );

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; more");
    expect(html).toContain("5 &lt; 6 &quot;quoted&quot;");
  });

  it("shows bands and labels and no numeric scores", async () => {
    const html = renderReportHtml(await build());

    expect(html).toContain("Opportunity");
    expect(html).toContain("Doing well");
    expect(html).not.toMatch(/92\.5|82\.5|\b35\b|score/i);
  });

  it("includes the priority callout, starting line, channels, experiments, and bottom line", async () => {
    const html = renderReportHtml(await build());

    expect(html).toContain("What you most want help with");
    expect(html).toContain("Your starting line");
    expect(html).toContain("Where your interviews are coming from");
    expect(html).not.toContain("One pattern worth testing");
    expect(html).not.toContain("How a typical application compares");
    expect(html).toContain("Experiments to try");
    expect(html).toContain("Ask for advice first, not for a job");
    expect(html).toContain("Bottom line");
  });

  it("omits sections that have no data", async () => {
    const html = renderReportHtml(
      await build({
        priority: null,
        startingLine: [],
        channels: { rows: [], totalInterviews: null, effortIsNumeric: false, mismatches: [] },
        context: [],
        experiments: [],
      }),
    );

    expect(html).not.toContain("What you most want help with");
    expect(html).not.toContain("Where your interviews are coming from");
    expect(html).not.toContain("Your starting line");
    expect(html).not.toContain("What is affecting your search");
    expect(html).not.toContain("Experiments to try over the next");
    expect(html).toContain("No experiments suggested this time.");
  });

  it("says when an area could not be rated", async () => {
    const report = await build();
    report.dimensions[0] = {
      ...report.dimensions[0],
      band: null,
      bandId: null,
      strengthText: "",
      improvementText: "",
    };

    const html = renderReportHtml(report);

    expect(html).toContain("Not enough to rate");
    expect(html).toContain("There was not enough in the interview to rate this area.");
  });

  it("starts with a short version: what is working, what is not, and the experiments to try", async () => {
    const report = await build();
    const html = renderReportHtml(report);

    const tldr = html.slice(html.indexOf('class="tldr"'), html.indexOf('class="lede"'));
    expect(html.indexOf('class="tldr"')).toBeLessThan(html.indexOf('class="lede"'));
    expect(tldr).toContain("The short version");
    expect(tldr).toContain("Working well");
    expect(tldr).toContain("Not working as well");
    expect(tldr).toContain("Experiments to try");
    expect(tldr).toContain(escapeHtml(report.experiments[0].title));
    const strength = report.dimensions.find((d) => d.strength)!;
    expect(tldr).toContain(
      escapeHtml(
        `${strength.name}: ${strength.behaviors.find((b) => b.id === strength.strength)!.name}`,
      ),
    );
  });

  it("builds the short version from the report, so edited experiments carry through", async () => {
    const report = await build();
    const tldr = buildTldr({
      ...report,
      experiments: [{ ...report.experiments[0], title: "A new idea" }],
    });

    expect(tldr.experiments).toEqual(["A new idea"]);
    expect(tldr.workingWell.length).toBeGreaterThan(0);
  });

  it("explains each of the four areas in plain words", async () => {
    const html = renderReportHtml(await build());

    for (const text of Object.values(DIMENSION_EXPLAINERS))
      expect(html).toContain(escapeHtml(text));
    expect(Object.keys(DIMENSION_EXPLAINERS)).toEqual(["focus", "pitch", "reach", "learn"]);
  });

  it("shows the levels as an ordered ladder from Opportunity up to Strong", async () => {
    const report = await build();
    const html = renderReportHtml(report);

    expect(html.indexOf("What the levels mean")).toBeGreaterThan(-1);
    const legend = html.slice(html.indexOf('class="levels"'));
    expect(legend.indexOf("Opportunity")).toBeLessThan(legend.indexOf("Developing"));
    expect(legend.indexOf("Developing")).toBeLessThan(legend.indexOf("Strong"));
    expect(html).toContain("the most room to grow");
    expect(ladderSteps("opportunity")).toBe(1);
    expect(ladderSteps("developing")).toBe(2);
    expect(ladderSteps("strong")).toBe(3);
    expect(ladderSteps(null)).toBe(0);
    expect(html).toMatch(/class="ladder" role="img" aria-label="Level \w+: step \d of 3/);
  });

  it("is a self-contained, non-indexed page", async () => {
    const html = renderReportHtml(await build());

    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).not.toMatch(/<script|src=|href=|@import/);
  });
});

describe("escapeHtml", () => {
  it("escapes the five special characters", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;",
    );
  });
});
