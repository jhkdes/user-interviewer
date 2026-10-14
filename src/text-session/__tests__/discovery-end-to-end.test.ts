import { describe, expect, it } from "vitest";
import { DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS } from "@/interview-agent/termination";
import { InMemoryJobSearchReportRepository } from "@/job-search-study/storage/in-memory-report-repository";
import { MIN_PARTICIPANT_TURNS_FOR_REPORT } from "@/job-search-study/min-turns";
import { enqueueEligibleReports } from "@/job-search-study/pipeline/enqueue";
import { startInterview } from "@/participant-intake";
import { createStudy } from "@/study-service";
import { renderStudyTranscriptsMarkdown } from "@/study-report-service/render-study-transcripts-markdown";
import { startTextTurn } from "../text-turn";
import { drain, setupTextSession } from "./test-helpers";

/**
 * A whole typed discovery interview, from the study's text link to the stored
 * transcript, the summary and the job-search report queue — the path a
 * participant on the text link takes, with only the model scripted.
 */

const intake = { firstName: "Sam", email: "sam@example.com", consentGiven: true };

function reply(text: string, end = false) {
  return {
    textChunks: [text.slice(0, 4), text.slice(4)],
    shouldEndInterview: end,
    participantRequestedEnd: false,
  };
}

async function typedInterview(options: { reportPipeline?: "job-search" } = {}) {
  const s = await setupTextSession({ studyType: "discovery" });
  const study = await createStudy(s.studyRepo, {
    title: "How Job Seekers Get Interviews",
    description: "how you search for a job",
    preInterviewQuestions: [],
    reportPipeline: options.reportPipeline,
  });
  const interview = await startInterview(
    { studyRepo: s.studyRepo, interviewRepo: s.interviewRepo, textEnabled: true },
    { ...intake, linkToken: study.textLinkToken as string },
  );

  const startMs = Date.now();
  let step = 0;
  /** Each turn happens well over a minute after the last, so the per-minute rate limit never applies. */
  const turn = (input: { clientMessageId: string; message?: string }) =>
    startTextTurn(
      { ...s.deps, now: new Date(startMs + step++ * 70_000) },
      { interviewId: interview.id, ...input },
    );

  /** Sends the opening, then `count` participant messages. The model asks a question each time and says it is done from `endFrom` on. */
  async function run(count: number, endFrom: number) {
    s.llm.scriptInterviewerTurnStreams([reply("Hi Sam! What is your role?")]);
    await drain(await turn({ clientMessageId: "open" }));
    for (let i = 1; i <= count; i++) {
      const done = i >= endFrom;
      s.llm.scriptInterviewerTurnStreams([
        reply(done ? "Thank you, that covers it." : `Tell me more about thing ${i}?`, done),
      ]);
      const stored = await s.interviewRepo.getById(interview.id);
      if (stored?.status === "completed") return;
      await drain(await turn({ clientMessageId: `m-${i}`, message: `Answer ${i}` }));
    }
  }

  return { ...s, study, interview, run };
}

describe("a typed discovery interview from the text link", () => {
  it("is a typed interview of the study, with no recording or call", async () => {
    const t = await typedInterview();
    const stored = await t.interviewRepo.getById(t.interview.id);

    expect(stored?.studyId).toBe(t.study.id);
    expect(stored?.mode).toBe("text");
    expect(stored?.recordingUrl).toBeNull();
    expect(stored?.vapiCallId).toBeNull();
    expect(stored?.elevenLabsConversationId).toBeNull();
  });

  it("runs to the AI's own ending after the 12th message and stores a transcript, summary, and email", async () => {
    const t = await typedInterview();

    await t.run(14, DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS);

    const stored = await t.interviewRepo.getById(t.interview.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.endedReason).toBe("text-interview-ended");
    const participantTurns = stored?.transcript?.filter((e) => e.speaker === "participant") ?? [];
    expect(participantTurns).toHaveLength(DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS);
    expect(stored?.transcript?.[0]).toMatchObject({
      speaker: "interviewer",
      text: "Hi Sam! What is your role?",
    });
    expect(stored?.recordingUrl).toBeNull();
    expect((await t.summaryRepo.getByInterviewId(t.interview.id))?.takeaways).toEqual([
      "Manual month-end close is the main pain.",
    ]);
    expect(t.emailClient.sent).toHaveLength(1);
    expect(await t.messageRepo.listByInterviewId(t.interview.id)).toEqual([]);
  });

  it("is marked as typed in the transcripts export", async () => {
    const t = await typedInterview();
    await t.run(14, DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS);
    const stored = (await t.interviewRepo.getById(t.interview.id))!;

    const markdown = renderStudyTranscriptsMarkdown(t.study, [stored]);

    expect(markdown).toContain("Interview mode: typed (written chat), not voice.");
    expect(markdown).toContain("Answer 1");
  });

  it("is counted by the job-search report queue like a spoken one: 14 typed turns queue a report", async () => {
    const t = await typedInterview({ reportPipeline: "job-search" });
    // The AI says it is done from message 1 on, but may not end before the report's minimum.
    await t.run(20, 1);

    const stored = await t.interviewRepo.getById(t.interview.id);
    expect(stored?.status).toBe("completed");
    const participantTurns = stored?.transcript?.filter((e) => e.speaker === "participant") ?? [];
    expect(participantTurns).toHaveLength(MIN_PARTICIPANT_TURNS_FOR_REPORT);

    const reportRepo = new InMemoryJobSearchReportRepository();
    const summary = await enqueueEligibleReports({
      studyRepo: t.studyRepo,
      interviewRepo: t.interviewRepo,
      reportRepo,
      complete: async () => {
        throw new Error("extraction is not part of this test");
      },
    });

    expect(summary).toEqual({ enqueued: 1, skipped: 0 });
    expect((await reportRepo.getByInterviewId(t.interview.id))?.status).toBe("pending");
  });

  it("does not let the AI end a job-search interview before the report's minimum, but does end an ordinary study at 12", async () => {
    const search = await typedInterview({ reportPipeline: "job-search" });
    await search.run(MIN_PARTICIPANT_TURNS_FOR_REPORT - 1, 1);
    expect((await search.interviewRepo.getById(search.interview.id))?.status).toBe("in-progress");

    const ordinary = await typedInterview();
    await ordinary.run(DISCOVERY_TEXT_MIN_PARTICIPANT_TURNS, 1);
    expect((await ordinary.interviewRepo.getById(ordinary.interview.id))?.status).toBe("completed");
  });
});
