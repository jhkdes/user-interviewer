import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PmContext } from "@/pm-auth";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyReportRepository } from "@/repositories/in-memory/in-memory-study-report-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";

const repos = vi.hoisted(() => ({
  ctx: null as unknown,
  study: null as unknown,
  interview: null as unknown,
  summary: null as unknown,
  report: null as unknown,
}));

vi.mock("@/pm-auth/current-pm-context", () => ({ getCurrentPmContext: async () => repos.ctx }));
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => repos.study }));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => repos.interview,
}));
vi.mock("@/repositories/get-summary-repository", () => ({
  getSummaryRepository: () => repos.summary,
}));
vi.mock("@/repositories/get-study-report-repository", () => ({
  getStudyReportRepository: () => repos.report,
}));

import ViewerHomePage from "../page";
import ViewerStudyPage from "../studies/[studyId]/page";
import ViewerInterviewPage from "../studies/[studyId]/interviews/[interviewId]/page";

const WHO = {
  firstName: "Priya",
  email: "priya.raman@acme-corp.test",
  trackingId: "trk-priya-7781",
};

const ctx = (role: PmContext["role"], grantedStudyIds: string[] = []): PmContext => ({
  userId: "u",
  email: "viewer@example.com",
  role,
  grantedStudyIds,
});

describe("viewer pages", () => {
  let studyId: string;
  let otherStudyId: string;
  let interviewId: string;
  let inProgressId: string;

  beforeEach(async () => {
    const study = new InMemoryStudyRepository();
    const interview = new InMemoryInterviewRepository();
    const summary = new InMemorySummaryRepository();
    const report = new InMemoryStudyReportRepository();
    Object.assign(repos, { study, interview, summary, report });

    const make = (title: string, linkToken: string, researchTopic?: string) =>
      study.create({
        title,
        researchTopic,
        description: "how PMs use AI",
        preInterviewQuestions: [
          { id: "q1", label: "Team size?", type: "single", options: ["1-5"] },
        ],
        linkToken,
        textLinkToken: `${linkToken}-text`,
      });
    studyId = (
      await make("How PMs use AI", "voice-link-abc", "where AI helps and where it gets in the way")
    ).id;
    otherStudyId = (await make("Another study", "voice-link-def")).id;

    const done = await interview.create({
      studyId,
      ...WHO,
      roleDescription: "PM at a startup",
      screenerAnswers: { q1: "1-5" },
    });
    await interview.update(done.id, {
      status: "completed",
      startedAt: new Date("2026-01-01T10:00:00Z"),
      completedAt: new Date("2026-01-01T10:12:00Z"),
      vapiCallId: "call-1",
      transcript: [
        { speaker: "interviewer", text: "Hi Priya, thanks for joining.", timestampMs: 0 },
        {
          speaker: "participant",
          text: "Mail me at priya.raman@acme-corp.test.",
          timestampMs: 4000,
        },
      ],
    });
    interviewId = done.id;
    await summary.create({ interviewId, takeaways: ["Wants faster specs"] });

    // Distinct creation times, so participant numbering is deterministic.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const pending = await interview.create({ studyId, firstName: "Marcus", email: "m@x.test" });
    await interview.update(pending.id, { status: "in-progress" });
    inProgressId = pending.id;

    await report.create({
      studyId,
      themes: [
        { theme: "Slow specs", participantCount: 1, representativeQuotes: ["Priya said so"] },
      ],
    });
  });

  const render = async (element: Promise<React.ReactElement> | React.ReactElement) =>
    renderToStaticMarkup(await element);

  const html = async () => {
    repos.ctx = ctx("viewer", [studyId]);
    return [
      await render(ViewerHomePage()),
      await render(ViewerStudyPage({ params: { studyId } })),
      await render(ViewerInterviewPage({ params: { studyId, interviewId } })),
    ].join("\n");
  };

  it("shows a viewer their granted studies, and only those", async () => {
    repos.ctx = ctx("viewer", [studyId]);
    const page = await render(ViewerHomePage());
    expect(page).toContain("How PMs use AI");
    expect(page).not.toContain("Another study");
  });

  it("says so when nothing has been shared yet", async () => {
    repos.ctx = ctx("viewer", []);
    expect(await render(ViewerHomePage())).toContain("No studies have been shared with you yet");
  });

  it("shows the interview under a participant number with the transcript and summary", async () => {
    repos.ctx = ctx("viewer", [studyId]);
    const page = await render(ViewerInterviewPage({ params: { studyId, interviewId } }));

    expect(page).toContain("Participant 1");
    expect(page).toContain("Hi [Participant], thanks for joining.");
    expect(page).toContain("Wants faster specs");
    expect(page).toContain("PM at a startup");
    expect(page).toContain(`src="/api/interviews/${interviewId}/recording"`);
  });

  it("shows the pre-interview answers under the date line, above the recording", async () => {
    repos.ctx = ctx("viewer", [studyId]);
    const page = await render(ViewerInterviewPage({ params: { studyId, interviewId } }));

    const dateLine = page.indexOf("duration 12:00");
    const answers = page.indexOf("Pre-interview answers");
    const recording = page.indexOf("Recording");
    expect(dateLine).toBeGreaterThan(-1);
    expect(answers).toBeGreaterThan(dateLine);
    expect(recording).toBeGreaterThan(answers);
    expect(page).toContain("Team size?");
    expect(page).toContain("1-5");
  });

  it("shows the research topic just above the pre-interview questions", async () => {
    repos.ctx = ctx("viewer", [studyId]);
    const page = await render(ViewerStudyPage({ params: { studyId } }));

    const topic = page.indexOf("Research topic");
    const questions = page.indexOf("Pre-interview questions");
    expect(topic).toBeGreaterThan(-1);
    expect(page).toContain("where AI helps and where it gets in the way");
    expect(questions).toBeGreaterThan(topic);
    // Nothing else sits between them.
    expect(page.slice(topic, questions)).not.toContain("<h2");
    expect(page).not.toContain("Research focus");
  });

  it("leaves out the research topic when the study has none", async () => {
    const bare = await (repos.study as InMemoryStudyRepository).create({
      title: "No topic",
      description: "d",
      preInterviewQuestions: [],
      linkToken: "tok-bare",
    });
    repos.ctx = ctx("viewer", [bare.id]);

    expect(await render(ViewerStudyPage({ params: { studyId: bare.id } }))).not.toContain(
      "Research topic",
    );
  });

  it("labels the questions 'Pre-interview questions' and keeps them collapsed", async () => {
    repos.ctx = ctx("viewer", [studyId]);
    const page = await render(ViewerStudyPage({ params: { studyId } }));

    const details = page.match(/<details[^>]*>/);
    expect(details).not.toBeNull();
    expect(details![0]).not.toContain("open");
    expect(page).toMatch(/<summary[^>]*>Pre-interview questions<\/summary>/);
    expect(page).not.toMatch(/<h2[^>]*>Questions<\/h2>/);
    // Still in the page, ready to open.
    expect(page).toContain("Team size?");
  });

  it("lists only completed interviews on the study page", async () => {
    repos.ctx = ctx("viewer", [studyId]);
    const page = await render(ViewerStudyPage({ params: { studyId } }));

    expect(page).toContain(`/viewer/studies/${studyId}/interviews/${interviewId}`);
    expect(page).not.toContain(inProgressId);
  });

  it("puts no participant identity anywhere in the HTML", async () => {
    const page = (await html()).toLowerCase();
    for (const value of ["priya", "marcus", WHO.email, WHO.trackingId, "m@x.test"]) {
      expect(page).not.toContain(value.toLowerCase());
    }
  });

  it("puts no participant link, stored recording URL or call id in the HTML", async () => {
    const page = await html();
    for (const value of ["voice-link-abc", "voice-link-abc-text", "call-1", "/interview/"]) {
      expect(page).not.toContain(value);
    }
  });

  it("has no write controls, exports or links back into the dashboard", async () => {
    const page = await html();

    expect(page).not.toMatch(/\/dashboard|\/export|\/api\/studies/);
    expect(page).not.toMatch(/<form|<input|<textarea|<select/i);
    expect(page).not.toMatch(/Delete|Remove|Edit |Extend|Generate report|Download|Copy/);
    // The only buttons are timestamp seek buttons for the audio.
    for (const button of page.match(/<button[^>]*>.*?<\/button>/g) ?? []) {
      expect(button).toContain("Play the recording from here");
    }
  });

  it("treats a study the viewer was not granted as not found", async () => {
    repos.ctx = ctx("viewer", [studyId]);
    await expect(ViewerStudyPage({ params: { studyId: otherStudyId } })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    await expect(
      ViewerInterviewPage({ params: { studyId: otherStudyId, interviewId } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("treats an interview that is not completed, or from another study, as not found", async () => {
    repos.ctx = ctx("viewer", [studyId]);
    await expect(
      ViewerInterviewPage({ params: { studyId, interviewId: inProgressId } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    repos.ctx = ctx("viewer", [studyId, otherStudyId]);
    await expect(
      ViewerInterviewPage({ params: { studyId: otherStudyId, interviewId } }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sends a signed-out visitor to login and an admin on /viewer to the dashboard", async () => {
    repos.ctx = null;
    await expect(ViewerStudyPage({ params: { studyId } })).rejects.toThrow("NEXT_REDIRECT");

    repos.ctx = ctx("admin");
    await expect(ViewerHomePage()).rejects.toThrow("NEXT_REDIRECT");
  });
});
