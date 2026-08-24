import { describe, expect, it } from "vitest";
import { FakeLLMProvider } from "@/llm";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InMemoryStudyReportRepository } from "@/repositories/in-memory/in-memory-study-report-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import { NONEXISTENT_ID } from "@/repositories/contract-tests/nonexistent-id";
import { generateStudyReport } from "../generate-study-report";
import { NoEligibleInterviewsError, StudyNotFoundError } from "../errors";

const targetProfile = {
  industry: "SaaS",
  yearsOfExperience: "5+",
  jobTitle: "Engineering Manager",
  seniority: "Manager",
  responsibility: "Team delivery",
};

const scriptedThemes = [
  {
    theme: "Manual status reporting is a major time sink",
    participantCount: 2,
    representativeQuotes: ["I basically have a second job just making slides."],
  },
];

async function setup() {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const summaryRepo = new InMemorySummaryRepository();
  const studyReportRepo = new InMemoryStudyReportRepository();
  const llm = new FakeLLMProvider();

  const study = await studyRepo.create({ targetProfile, linkToken: "token-1" });

  return { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm, study };
}

async function completeInterview(
  interviewRepo: InMemoryInterviewRepository,
  summaryRepo: InMemorySummaryRepository,
  studyId: string,
  name: string,
) {
  const interview = await interviewRepo.create({
    studyId,
    firstName: name,
    email: `${name.toLowerCase()}@example.com`,
    roleDescription: "Engineering manager",
  });
  await interviewRepo.update(interview.id, {
    status: "completed",
    transcript: [
      { speaker: "interviewer", text: "How's your week?", timestampMs: 0 },
      { speaker: "participant", text: "Buried in status reports.", timestampMs: 4000 },
    ],
  });
  await summaryRepo.create({
    interviewId: interview.id,
    painPoints: ["Manual status reporting eats a full afternoon each week."],
    notableQuotes: ["I basically have a second job just making slides."],
    takeaways: ["Reporting tooling is a strong automation candidate."],
  });
  return interview;
}

describe("generateStudyReport", () => {
  it("generates and persists a report from a single completed, summarized interview", async () => {
    const { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm, study } = await setup();
    await completeInterview(interviewRepo, summaryRepo, study.id, "Jordan");
    llm.scriptStudyReport({ themes: scriptedThemes });

    const report = await generateStudyReport(
      { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm },
      study.id,
    );

    expect(report).toMatchObject({ studyId: study.id, version: 1, themes: scriptedThemes });
    expect(llm.calls.generateStudyReport[0].interviews).toHaveLength(1);
  });

  it("includes every completed, summarized interview in a multi-interview study", async () => {
    const { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm, study } = await setup();
    await completeInterview(interviewRepo, summaryRepo, study.id, "Jordan");
    await completeInterview(interviewRepo, summaryRepo, study.id, "Alex");
    await completeInterview(interviewRepo, summaryRepo, study.id, "Sam");
    llm.scriptStudyReport({ themes: scriptedThemes });

    await generateStudyReport(
      { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm },
      study.id,
    );

    expect(llm.calls.generateStudyReport[0].interviews).toHaveLength(3);
  });

  it("excludes interviews that are completed but have no persisted summary", async () => {
    const { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm, study } = await setup();
    await completeInterview(interviewRepo, summaryRepo, study.id, "Jordan");
    await interviewRepo.create({
      studyId: study.id,
      firstName: "NoSummary",
      email: "nosummary@example.com",
      roleDescription: "PM",
    });
    llm.scriptStudyReport({ themes: scriptedThemes });

    await generateStudyReport(
      { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm },
      study.id,
    );

    expect(llm.calls.generateStudyReport[0].interviews).toHaveLength(1);
  });

  it("creates a new incrementing version on each call, not an overwrite", async () => {
    const { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm, study } = await setup();
    await completeInterview(interviewRepo, summaryRepo, study.id, "Jordan");
    llm.scriptStudyReport({ themes: scriptedThemes });

    const first = await generateStudyReport(
      { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm },
      study.id,
    );
    const second = await generateStudyReport(
      { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm },
      study.id,
    );

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(await studyReportRepo.listByStudyId(study.id)).toHaveLength(2);
  });

  it("throws StudyNotFoundError for an unknown study id", async () => {
    const { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm } = await setup();

    await expect(
      generateStudyReport(
        { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm },
        NONEXISTENT_ID,
      ),
    ).rejects.toThrow(StudyNotFoundError);
  });

  it("throws NoEligibleInterviewsError when the study has no completed interviews", async () => {
    const { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm, study } = await setup();
    await interviewRepo.create({
      studyId: study.id,
      firstName: "Pending",
      email: "pending@example.com",
      roleDescription: "PM",
    });

    await expect(
      generateStudyReport(
        { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm },
        study.id,
      ),
    ).rejects.toThrow(NoEligibleInterviewsError);
  });

  it("throws NoEligibleInterviewsError when completed interviews all lack a summary", async () => {
    const { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm, study } = await setup();
    const interview = await interviewRepo.create({
      studyId: study.id,
      firstName: "Jordan",
      email: "jordan@example.com",
      roleDescription: "Engineering manager",
    });
    await interviewRepo.update(interview.id, {
      status: "completed",
      transcript: [{ speaker: "participant", text: "Hi.", timestampMs: 0 }],
    });

    await expect(
      generateStudyReport(
        { studyRepo, interviewRepo, summaryRepo, studyReportRepo, llm },
        study.id,
      ),
    ).rejects.toThrow(NoEligibleInterviewsError);
  });
});
