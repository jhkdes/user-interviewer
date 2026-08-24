import { describe, expect, it } from "vitest";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import { NONEXISTENT_ID } from "@/repositories/contract-tests/nonexistent-id";
import { generateIndividualSummary } from "../generate-individual-summary";
import { InterviewNotFoundError, MissingTranscriptError } from "../errors";

const scriptedSummary = {
  painPoints: ["Manual status reporting eats a full afternoon each week."],
  notableQuotes: ["I basically have a second job just making slides."],
  takeaways: ["Reporting tooling is a strong candidate for automation."],
};

async function setup() {
  const interviewRepo = new InMemoryInterviewRepository();
  const summaryRepo = new InMemorySummaryRepository();
  const llm = new FakeLLMProvider();

  const interview = await interviewRepo.create({
    studyId: "study-1",
    firstName: "Jordan",
    email: "jordan@example.com",
    roleDescription: "Engineering manager",
  });

  return { interviewRepo, summaryRepo, llm, interview };
}

describe("generateIndividualSummary", () => {
  it("generates and persists a summary from the interview's transcript", async () => {
    const { interviewRepo, summaryRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, {
      status: "completed",
      transcript: [
        { speaker: "interviewer", text: "How's your week going?", timestampMs: 0 },
        { speaker: "participant", text: "Buried in status reports, honestly.", timestampMs: 4000 },
      ],
    });
    llm.scriptSummary(scriptedSummary);

    const summary = await generateIndividualSummary(
      { interviewRepo, summaryRepo, llm },
      interview.id,
    );

    expect(summary).toMatchObject({ interviewId: interview.id, ...scriptedSummary });
    expect(await summaryRepo.getByInterviewId(interview.id)).toEqual(summary);
  });

  it("strips timestamps before calling the LLM — it only needs speaker/text", async () => {
    const { interviewRepo, summaryRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, {
      transcript: [{ speaker: "interviewer", text: "Hi.", timestampMs: 1234 }],
    });
    llm.scriptSummary(scriptedSummary);

    await generateIndividualSummary({ interviewRepo, summaryRepo, llm }, interview.id);

    expect(llm.calls.generateSummary[0].transcript).toEqual([
      { speaker: "interviewer", text: "Hi." },
    ]);
  });

  it("throws InterviewNotFoundError for an unknown interview id", async () => {
    const { interviewRepo, summaryRepo, llm } = await setup();

    await expect(
      generateIndividualSummary({ interviewRepo, summaryRepo, llm }, NONEXISTENT_ID),
    ).rejects.toThrow(InterviewNotFoundError);
  });

  it("throws MissingTranscriptError when the interview has no transcript yet", async () => {
    const { interviewRepo, summaryRepo, llm, interview } = await setup();

    await expect(
      generateIndividualSummary({ interviewRepo, summaryRepo, llm }, interview.id),
    ).rejects.toThrow(MissingTranscriptError);
  });

  it("throws MissingTranscriptError when the transcript is an empty array", async () => {
    const { interviewRepo, summaryRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, { transcript: [] });

    await expect(
      generateIndividualSummary({ interviewRepo, summaryRepo, llm }, interview.id),
    ).rejects.toThrow(MissingTranscriptError);
  });
});
