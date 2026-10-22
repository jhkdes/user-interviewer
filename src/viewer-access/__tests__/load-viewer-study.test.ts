import { beforeEach, describe, expect, it } from "vitest";
import type { Study } from "@/domain";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyReportRepository } from "@/repositories/in-memory/in-memory-study-report-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { InMemorySummaryRepository } from "@/repositories/in-memory/in-memory-summary-repository";
import { loadViewerStudy, type ViewerStudyDeps } from "../load-viewer-study";

const PRIYA = {
  firstName: "Priya",
  email: "priya.raman@acme-corp.test",
  trackingId: "trk-priya-7781",
};
const MARCUS = { firstName: "Marcus", email: "marcus@globex.test", trackingId: "trk-marcus-2290" };
const DANA = { firstName: "Dana", email: "dana@initech.test", trackingId: "trk-dana-0042" };

describe("loadViewerStudy", () => {
  let deps: ViewerStudyDeps;
  let study: Study;
  let ids: { priya: string; marcus: string; dana: string };

  beforeEach(async () => {
    deps = {
      studyRepo: new InMemoryStudyRepository(),
      interviewRepo: new InMemoryInterviewRepository(),
      summaryRepo: new InMemorySummaryRepository(),
      reportRepo: new InMemoryStudyReportRepository(),
    };
    study = await deps.studyRepo.create({
      title: "How PMs use AI",
      description: "how product managers use AI day to day",
      preInterviewQuestions: [
        { id: "q1", label: "Your team size?", type: "single", options: ["1-5", "6-20"] },
      ],
      researchTopic: "where AI helps and where it gets in the way",
      customPrompt: "SECRET-CUSTOM-PROMPT Hello {{participant_name}}",
      linkToken: "voice-link-token-abc",
      textLinkToken: "text-link-token-xyz",
    });

    const make = async (who: typeof PRIYA, status: "completed" | "in-progress", extra = {}) => {
      const interview = await deps.interviewRepo.create({
        studyId: study.id,
        ...who,
        roleDescription: `PM at ${who.firstName}'s company`,
        screenerAnswers: { q1: "6-20" },
      });
      return deps.interviewRepo.update(interview.id, {
        status,
        startedAt: new Date("2026-01-01T10:00:00Z"),
        completedAt: status === "completed" ? new Date("2026-01-01T10:15:00Z") : null,
        transcript: [
          {
            speaker: "interviewer",
            text: `Hi ${who.firstName}, thanks for joining.`,
            timestampMs: 0,
          },
          {
            speaker: "participant",
            text: `Sure. You can reach me at ${who.email} afterwards. We use AI for specs.`,
            timestampMs: 5000,
          },
        ],
        vapiCallId: "call-1",
        ...extra,
      });
    };

    const priya = await make(PRIYA, "completed");
    await new Promise((r) => setTimeout(r, 5));
    const marcus = await make(MARCUS, "in-progress");
    await new Promise((r) => setTimeout(r, 5));
    const dana = await make(DANA, "completed");
    ids = { priya: priya.id, marcus: marcus.id, dana: dana.id };

    await deps.summaryRepo.create({
      interviewId: priya.id,
      painPoints: ["Priya said reviews take too long"],
      notableQuotes: [`"Honestly, Priya here: I'd pay for this" (priya.raman@acme-corp.test)`],
      takeaways: ["Wants faster specs"],
    });
    await deps.reportRepo.create({
      studyId: study.id,
      themes: [
        {
          theme: "Specs take too long",
          participantCount: 2,
          representativeQuotes: ["Dana told us specs drag", "Marcus agreed"],
        },
      ],
    });
  });

  it("returns null for an unknown study", async () => {
    expect(await loadViewerStudy("missing", deps)).toBeNull();
  });

  it("contains no participant identity anywhere in what a viewer receives", async () => {
    const data = await loadViewerStudy(study.id, deps);
    const json = JSON.stringify(data);

    for (const who of [PRIYA, MARCUS, DANA]) {
      expect(json.toLowerCase()).not.toContain(who.firstName.toLowerCase());
      expect(json).not.toContain(who.email);
      expect(json).not.toContain(who.trackingId);
    }
  });

  it("keeps the participant's content and marks the redactions", async () => {
    const data = await loadViewerStudy(study.id, deps);
    const priya = data!.interviews.find((i) => i.id === ids.priya)!;

    expect(priya.transcript![0].text).toBe("Hi [Participant], thanks for joining.");
    expect(priya.transcript![1].text).toBe(
      "Sure. You can reach me at [redacted email] afterwards. We use AI for specs.",
    );
    expect(priya.summary!.takeaways).toEqual(["Wants faster specs"]);
    expect(priya.summary!.painPoints).toEqual(["[Participant] said reviews take too long"]);
    expect(priya.roleDescription).toBe("PM at [Participant]'s company");
    expect(priya.screenerAnswers).toEqual({ q1: "6-20" });
  });

  it("returns completed interviews only", async () => {
    const data = await loadViewerStudy(study.id, deps);
    expect(data!.interviews.map((i) => i.id).sort()).toEqual([ids.priya, ids.dana].sort());
    expect(JSON.stringify(data)).not.toContain(ids.marcus);
  });

  it("numbers participants by creation order across all interviews, so numbers hold as interviews finish", async () => {
    const before = await loadViewerStudy(study.id, deps);
    expect(before!.interviews.map((i) => i.label)).toEqual(["Participant 1", "Participant 3"]);

    await deps.interviewRepo.update(ids.marcus, { status: "completed" });
    const after = await loadViewerStudy(study.id, deps);
    const labelFor = (data: typeof after, id: string) =>
      data!.interviews.find((i) => i.id === id)!.label;
    expect(after!.interviews.map((i) => i.label)).toEqual([
      "Participant 1",
      "Participant 2",
      "Participant 3",
    ]);
    expect(labelFor(after, ids.priya)).toBe("Participant 1");
    expect(labelFor(after, ids.dana)).toBe("Participant 3");
  });

  it("leaves out the study's participant links, custom prompt and page copy", async () => {
    const data = await loadViewerStudy(study.id, deps);
    const json = JSON.stringify(data);

    expect(json).not.toContain("voice-link-token-abc");
    expect(json).not.toContain("text-link-token-xyz");
    expect(json).not.toContain("SECRET-CUSTOM-PROMPT");
    expect(data!.study).toMatchObject({
      title: "How PMs use AI",
      researchTopic: "where AI helps and where it gets in the way",
    });
  });

  it("exposes no stored recording URL, only whether audio exists", async () => {
    await deps.interviewRepo.update(ids.priya, {
      recordingUrl: "https://recordings.example.com/priya.wav?sig=secret",
    });
    const data = await loadViewerStudy(study.id, deps);
    const priya = data!.interviews.find((i) => i.id === ids.priya)!;

    expect(priya.hasRecording).toBe(true);
    expect(JSON.stringify(data)).not.toContain("recordings.example.com");
    expect(JSON.stringify(data)).not.toContain("call-1");
  });

  it("includes only fields the viewer types name", async () => {
    const data = await loadViewerStudy(study.id, deps);
    expect(Object.keys(data!.interviews[0]).sort()).toEqual([
      "completedAt",
      "createdAt",
      "durationSeconds",
      "hasRecording",
      "id",
      "label",
      "mode",
      "roleDescription",
      "screenerAnswers",
      "summary",
      "transcript",
    ]);
  });

  it("redacts names from the study report using every participant's name", async () => {
    const data = await loadViewerStudy(study.id, deps);
    expect(data!.report!.themes[0].representativeQuotes).toEqual([
      "[Participant] told us specs drag",
      "[Participant] agreed",
    ]);
  });
});
