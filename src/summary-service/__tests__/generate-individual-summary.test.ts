import { describe, expect, it } from "vitest";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import { NONEXISTENT_ID } from "@/repositories/contract-tests/nonexistent-id";
import { generateIndividualSummary } from "../generate-individual-summary";
import { InterviewNotFoundError, MissingTranscriptError, StudyNotFoundError } from "../errors";

const summaryFields = {
  painPoints: ["Manual status reporting eats a full afternoon each week."],
  notableQuotes: ["I basically have a second job just making slides."],
  takeaways: ["Reporting tooling is a strong candidate for automation."],
};
const scriptedSummary = { ...summaryFields, roleDescription: null };

async function setup() {
  const interviewRepo = new InMemoryInterviewRepository();
  const studyRepo = new InMemoryStudyRepository();
  const summaryRepo = new InMemorySummaryRepository();
  const llm = new FakeLLMProvider();

  const study = await studyRepo.create({
    title: "How AI Actually Shows Up in a PM's Day",
    description: "how product managers really use AI at work",
    preInterviewQuestions: [],
    linkToken: "token",
  });
  const interview = await interviewRepo.create({
    studyId: study.id,
    firstName: "Jordan",
    email: "jordan@example.com",
    roleDescription: "Engineering manager",
  });

  return { interviewRepo, studyRepo, summaryRepo, llm, study, interview };
}

describe("generateIndividualSummary", () => {
  it("generates and persists a summary from the interview's transcript", async () => {
    const { interviewRepo, studyRepo, summaryRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, {
      status: "completed",
      transcript: [
        { speaker: "interviewer", text: "How's your week going?", timestampMs: 0 },
        { speaker: "participant", text: "Buried in status reports, honestly.", timestampMs: 4000 },
      ],
    });
    llm.scriptSummary(scriptedSummary);

    const summary = await generateIndividualSummary(
      { interviewRepo, studyRepo, summaryRepo, llm },
      interview.id,
    );

    expect(summary).toMatchObject({ interviewId: interview.id, type: "discovery", ...summaryFields });
    expect(await summaryRepo.getByInterviewId(interview.id)).toEqual(summary);
  });

  it("strips timestamps before calling the LLM — it only needs speaker/text", async () => {
    const { interviewRepo, studyRepo, summaryRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, {
      transcript: [{ speaker: "interviewer", text: "Hi.", timestampMs: 1234 }],
    });
    llm.scriptSummary(scriptedSummary);

    await generateIndividualSummary({ interviewRepo, studyRepo, summaryRepo, llm }, interview.id);

    expect(llm.calls.generateSummary[0].transcript).toEqual([
      { speaker: "interviewer", text: "Hi." },
    ]);
  });

  it("throws InterviewNotFoundError for an unknown interview id", async () => {
    const { interviewRepo, studyRepo, summaryRepo, llm } = await setup();

    await expect(
      generateIndividualSummary({ interviewRepo, studyRepo, summaryRepo, llm }, NONEXISTENT_ID),
    ).rejects.toThrow(InterviewNotFoundError);
  });

  it("throws MissingTranscriptError when the interview has no transcript yet", async () => {
    const { interviewRepo, studyRepo, summaryRepo, llm, interview } = await setup();

    await expect(
      generateIndividualSummary({ interviewRepo, studyRepo, summaryRepo, llm }, interview.id),
    ).rejects.toThrow(MissingTranscriptError);
  });

  it("throws MissingTranscriptError when the transcript is an empty array", async () => {
    const { interviewRepo, studyRepo, summaryRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, { transcript: [] });

    await expect(
      generateIndividualSummary({ interviewRepo, studyRepo, summaryRepo, llm }, interview.id),
    ).rejects.toThrow(MissingTranscriptError);
  });

  it("backfills the interview's roleDescription when the LLM extracts one (#4)", async () => {
    const { interviewRepo, studyRepo, summaryRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, {
      roleDescription: null,
      transcript: [
        { speaker: "interviewer", text: "What's your role?", timestampMs: 0 },
        { speaker: "participant", text: "I'm an engineering manager.", timestampMs: 3000 },
      ],
    });
    llm.scriptSummary({ ...summaryFields, roleDescription: "Engineering manager" });

    await generateIndividualSummary({ interviewRepo, studyRepo, summaryRepo, llm }, interview.id);

    expect((await interviewRepo.getById(interview.id))?.roleDescription).toBe(
      "Engineering manager",
    );
  });

  it("leaves roleDescription null when the LLM never found one — doesn't hallucinate a placeholder (#4)", async () => {
    const { interviewRepo, studyRepo, summaryRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, {
      roleDescription: null,
      transcript: [{ speaker: "participant", text: "Not much to say, honestly.", timestampMs: 0 }],
    });
    llm.scriptSummary(scriptedSummary);

    await generateIndividualSummary({ interviewRepo, studyRepo, summaryRepo, llm }, interview.id);

    expect((await interviewRepo.getById(interview.id))?.roleDescription).toBeNull();
  });

  it("throws StudyNotFoundError when the interview's study no longer exists", async () => {
    const { interviewRepo, summaryRepo, llm, interview } = await setup();
    await interviewRepo.update(interview.id, {
      transcript: [{ speaker: "participant", text: "Hi.", timestampMs: 0 }],
    });
    const emptyStudyRepo = new InMemoryStudyRepository();

    await expect(
      generateIndividualSummary(
        { interviewRepo, studyRepo: emptyStudyRepo, summaryRepo, llm },
        interview.id,
      ),
    ).rejects.toThrow(StudyNotFoundError);
  });

  it("calls generateFeedbackSummary and persists liked/disliked/suggestions for a feedback-type study", async () => {
    const { interviewRepo, studyRepo, summaryRepo, llm } = await setup();
    const feedbackStudy = await studyRepo.create({
      title: "Post-webinar feedback",
      description: "quick check-in after today's session",
      type: "feedback",
      feedbackQuestions: ["What did you think of the content?"],
      preInterviewQuestions: [],
      linkToken: "feedback-token",
    });
    const interview = await interviewRepo.create({
      studyId: feedbackStudy.id,
      firstName: "Sam",
      email: "sam@example.com",
    });
    await interviewRepo.update(interview.id, {
      transcript: [
        { speaker: "interviewer", text: "What stood out to you today?", timestampMs: 0 },
        { speaker: "participant", text: "The pacing was great, but audio cut out once.", timestampMs: 3000 },
      ],
    });
    const feedbackFields = {
      liked: ["The pacing"],
      disliked: ["Audio cut out once"],
      suggestions: ["Double-check the audio setup beforehand"],
    };
    llm.scriptFeedbackSummary(feedbackFields);

    const summary = await generateIndividualSummary(
      { interviewRepo, studyRepo, summaryRepo, llm },
      interview.id,
    );

    expect(summary).toMatchObject({ interviewId: interview.id, type: "feedback", ...feedbackFields });
    expect(llm.calls.generateFeedbackSummary).toHaveLength(1);
    expect(llm.calls.generateSummary).toHaveLength(0);
    expect((await interviewRepo.getById(interview.id))?.roleDescription).toBeNull();
  });
});
