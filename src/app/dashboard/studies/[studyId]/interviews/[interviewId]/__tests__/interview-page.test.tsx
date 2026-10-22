import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";

const repos = vi.hoisted(() => ({
  study: null as unknown,
  interview: null as unknown,
  summary: null as unknown,
}));

vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => repos.study }));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => repos.interview,
}));
vi.mock("@/repositories/get-summary-repository", () => ({
  getSummaryRepository: () => repos.summary,
}));
// The page embeds client components (remove button) that call useRouter.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/vapi/client", () => ({
  fetchFreshRecordingUrl: async () => "https://vapi.example/fresh.wav",
}));

import InterviewDetailPage from "../page";

describe("admin interview page", () => {
  let studyId: string;
  let interviewId: string;

  beforeEach(async () => {
    const study = new InMemoryStudyRepository();
    const interview = new InMemoryInterviewRepository();
    Object.assign(repos, { study, interview, summary: new InMemorySummaryRepository() });

    studyId = (
      await study.create({
        title: "How PMs use AI",
        description: "d",
        preInterviewQuestions: [
          { id: "q1", label: "Team size?", type: "single", options: ["1-5", "6-20"] },
          { id: "q2", label: "Tools used?", type: "multi", options: ["Claude", "ChatGPT"] },
        ],
        linkToken: "tok",
      })
    ).id;
    const created = await interview.create({
      studyId,
      firstName: "Priya",
      email: "priya@acme.test",
      screenerAnswers: { q1: "6-20", q2: ["Claude", "ChatGPT"] },
    });
    await interview.update(created.id, {
      status: "completed",
      startedAt: new Date("2026-01-01T10:00:00Z"),
      completedAt: new Date("2026-01-01T10:12:00Z"),
      vapiCallId: "call-1",
      transcript: [{ speaker: "interviewer", text: "Hello", timestampMs: 0 }],
    });
    interviewId = created.id;
  });

  const render = async () =>
    renderToStaticMarkup(await InterviewDetailPage({ params: { studyId, interviewId } }));

  it("shows the pre-interview answers just below the date line, above the recording", async () => {
    const page = await render();

    const dateLine = page.indexOf("duration 12:00");
    const answers = page.indexOf("Pre-interview answers");
    const recording = page.indexOf(">Recording<");
    expect(dateLine).toBeGreaterThan(-1);
    expect(answers).toBeGreaterThan(dateLine);
    expect(recording).toBeGreaterThan(answers);

    expect(page).toContain("Team size?");
    expect(page).toContain("6-20");
    expect(page).toContain("Tools used?");
    expect(page).toContain("Claude, ChatGPT");
  });

  it("pins the audio player", async () => {
    expect(await render()).toMatch(/<section class="sticky top-0[^"]*">\s*<h2[^>]*>Recording/);
  });
});
