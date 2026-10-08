import type { TranscriptEntry } from "@/domain";
import { FakeEmailClient } from "@/lib/email/fake-email-client";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import type { StructuredCompletion } from "../extraction/extract";
import type { NarrativePack } from "../report/narrative";
import type { PipelineDeps, ReviewDeps } from "../pipeline/types";
import { loadRubric } from "../rubric/rubric";
import { InMemoryJobSearchReportRepository } from "../storage/in-memory-report-repository";
import { blankLedger, toWireLedger, withEntry } from "./ledger-helpers";

const rubric = loadRubric();

/** A completed interview's transcript: the interviewer asks, the participant answers, `participantTurns` times. */
export function buildTranscript(participantTurns: number): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (let i = 0; i < participantTurns; i++) {
    entries.push({ speaker: "interviewer", text: `Question ${i + 1}?`, timestampMs: i * 20000 });
    entries.push({
      speaker: "participant",
      text:
        i === 0
          ? "I mostly apply through LinkedIn and I use one resume."
          : `Answer number ${i + 1} about my search.`,
      timestampMs: i * 20000 + 8000,
    });
  }
  return entries;
}

/** The wire-format ledger a model would return for the transcript above: every behavior rated 3 with a verifiable quote. */
function wireLedger() {
  let ledger = blankLedger(rubric);
  for (const behavior of rubric.behaviors) {
    ledger = withEntry(ledger, {
      id: behavior.id,
      status: "rated",
      score: 3,
      evidenceBasis: "concrete_example",
      subSignals: [{ name: behavior.subSignals[0], observation: "Described in the interview" }],
      quotes: [{ turnIndex: 1, text: "I mostly apply through LinkedIn" }],
      confidenceNote: null,
      trajectoryNote: null,
      statusReason: null,
    });
  }
  ledger.facts.totalConversations = 4;
  ledger.facts.sources = [
    { source: "cold_application", count: 2 },
    { source: "recruiter_inbound", count: 2 },
  ];
  ledger.reportPriority = { text: "How to get more interviews", turnIndex: 3 };
  return toWireLedger(ledger);
}

export interface FakeModelOptions {
  /** The first N extraction calls reject. */
  failExtractionCalls?: number;
  /** Reject every narrative call. */
  failNarrative?: boolean;
  /** Replace the executive summary the fake writer returns (for example to include a banned word). */
  executiveSummary?: string;
}

/** A model that plays the extractor and the report writer, and counts how often each was called. */
export function makeFakeModel(options: FakeModelOptions = {}) {
  const calls = { extraction: 0, narrative: 0 };
  const complete: StructuredCompletion = async ({ user, toolName }) => {
    if (toolName === "write_report") {
      calls.narrative++;
      if (options.failNarrative) throw new Error("narrative model down");
      // On a retry, feedback about rule violations follows the JSON pack.
      const pack = JSON.parse(
        user.slice(user.indexOf("{")).split("\n\nYour previous draft")[0],
      ) as NarrativePack;
      return {
        executiveSummary:
          options.executiveSummary ??
          "You are clear about what you want and your conversations come from several places.",
        whatWeHeard: "You are looking for product roles and apply mostly through job boards.",
        channelsNarrative:
          pack.channels.length > 0 ? "Your conversations came from a few different places." : "",
        bottomLine: "The idea that stands out is to build on what already works for you.",
        dimensions: pack.dimensions.map((d) => ({
          id: d.id,
          strengthText: d.strength ? "A short, grounded strength." : "",
          improvementText: d.improvement ? "A short, grounded area to build." : "",
        })),
      };
    }
    calls.extraction++;
    if (calls.extraction <= (options.failExtractionCalls ?? 0))
      throw new Error("extraction model down");
    return wireLedger();
  };
  return { complete, calls };
}

export interface Fixture {
  studyRepo: InMemoryStudyRepository;
  interviewRepo: InMemoryInterviewRepository;
  reportRepo: InMemoryJobSearchReportRepository;
  emailClient: FakeEmailClient;
  model: ReturnType<typeof makeFakeModel>;
  deps: PipelineDeps;
  reviewDeps: ReviewDeps;
  studyId: string;
  /** Adds a completed interview with this many participant turns. */
  addInterview(participantTurns: number, firstName?: string): Promise<string>;
}

export async function setup(
  options: {
    model?: FakeModelOptions;
    reportPipeline?: "job-search" | null;
    now?: () => Date;
  } = {},
): Promise<Fixture> {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const reportRepo = new InMemoryJobSearchReportRepository(options.now);
  const emailClient = new FakeEmailClient();
  const model = makeFakeModel(options.model);

  const study = await studyRepo.create({
    title: "How Job Seekers Get Interviews",
    description: "how you search for your next job",
    preInterviewQuestions: [],
    linkToken: `link-${Math.random().toString(36).slice(2)}`,
    ...(options.reportPipeline === null ? {} : { reportPipeline: "job-search" as const }),
  });

  const deps: PipelineDeps = {
    studyRepo,
    interviewRepo,
    reportRepo,
    complete: model.complete,
    now: options.now,
  };
  const reviewDeps: ReviewDeps = {
    studyRepo,
    interviewRepo,
    reportRepo,
    complete: model.complete,
    emailClient,
    now: options.now,
  };

  return {
    studyRepo,
    interviewRepo,
    reportRepo,
    emailClient,
    model,
    deps,
    reviewDeps,
    studyId: study.id,
    async addInterview(participantTurns: number, firstName = "Jordan") {
      const interview = await interviewRepo.create({
        studyId: study.id,
        firstName,
        email: `${firstName.toLowerCase()}@example.com`,
        screenerAnswers: { search_duration: "1 to 3 months" },
      });
      await interviewRepo.update(interview.id, {
        status: "completed",
        transcript: buildTranscript(participantTurns),
        completedAt: new Date(),
      });
      return interview.id;
    },
  };
}
