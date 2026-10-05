import { describe, expect, it } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { countCompletedInterviews } from "../count-completed-interviews";

const turn = { speaker: "interviewer" as const, text: "Hi.", timestampMs: 0 };

async function setup() {
  const studyRepo = new InMemoryStudyRepository();
  const interviewRepo = new InMemoryInterviewRepository();
  const study = await studyRepo.create({
    title: "Study",
    description: "desc",
    preInterviewQuestions: [],
    linkToken: "token-1",
  });
  const otherStudy = await studyRepo.create({
    title: "Other study",
    description: "desc",
    preInterviewQuestions: [],
    linkToken: "token-2",
  });

  async function interview(
    studyId: string,
    name: string,
    patch: Parameters<InMemoryInterviewRepository["update"]>[1],
  ) {
    const created = await interviewRepo.create({
      studyId,
      firstName: name,
      email: `${name.toLowerCase()}@example.com`,
    });
    return interviewRepo.update(created.id, patch);
  }

  return { deps: { studyRepo, interviewRepo }, study, otherStudy, interview };
}

describe("countCompletedInterviews", () => {
  it("is zero for a study nobody has finished", async () => {
    const { deps, study } = await setup();

    expect(await countCompletedInterviews(deps, study.id)).toBe(0);
  });

  it("counts the study's completed interviews that have a transcript", async () => {
    const { deps, study, interview } = await setup();
    await interview(study.id, "A", { status: "completed", transcript: [turn] });
    await interview(study.id, "B", { status: "completed", transcript: [turn] });
    await interview(study.id, "Running", { status: "in-progress", transcript: [turn] });
    await interview(study.id, "Empty", { status: "completed", transcript: [] });

    expect(await countCompletedInterviews(deps, study.id)).toBe(2);
  });

  it("counts only the requested study", async () => {
    const { deps, study, otherStudy, interview } = await setup();
    await interview(study.id, "Mine", { status: "completed", transcript: [turn] });
    await interview(otherStudy.id, "Theirs1", { status: "completed", transcript: [turn] });
    await interview(otherStudy.id, "Theirs2", { status: "completed", transcript: [turn] });

    expect(await countCompletedInterviews(deps, study.id)).toBe(1);
    expect(await countCompletedInterviews(deps, otherStudy.id)).toBe(2);
  });

  it("answers null for a study that doesn't exist", async () => {
    const { deps } = await setup();

    expect(await countCompletedInterviews(deps, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("answers null, without touching the database, for something that isn't an id", async () => {
    const { deps } = await setup();
    let touched = false;
    const watching = {
      ...deps,
      studyRepo: {
        ...deps.studyRepo,
        getById: async () => {
          touched = true;
          return null;
        },
      } as unknown as typeof deps.studyRepo,
    };

    for (const notAnId of ["", "abc", "not-a-uuid", "1; drop table studies", "../etc/passwd"]) {
      expect(await countCompletedInterviews(watching, notAnId)).toBeNull();
    }
    expect(touched).toBe(false);
  });
});
