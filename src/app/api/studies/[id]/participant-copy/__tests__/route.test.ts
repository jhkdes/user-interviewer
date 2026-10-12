import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { createStudy } from "@/study-service";

const repo = new InMemoryStudyRepository();
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => repo }));

import { PUT } from "../route";

afterEach(() => vi.restoreAllMocks());

const put = (id: string, body: unknown) =>
  PUT(
    new Request("http://localhost/api", {
      method: "PUT",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: { id } },
  );

async function newStudy() {
  return createStudy(repo, { title: "T", description: "D", preInterviewQuestions: [] });
}

describe("PUT /api/studies/[id]/participant-copy", () => {
  it("saves the copy and returns the study", async () => {
    const study = await newStudy();

    const res = await put(study.id, { participantCopy: { completion: { title: "Thanks" } } });

    expect(res.status).toBe(200);
    expect((await res.json()).participantCopy).toEqual({ completion: { title: "Thanks" } });
  });

  it("clears the copy when sent null", async () => {
    const study = await newStudy();
    await put(study.id, { participantCopy: { completion: { title: "Thanks" } } });

    const res = await put(study.id, { participantCopy: null });

    expect(res.status).toBe(200);
    expect((await res.json()).participantCopy).toBeNull();
  });

  it("answers 400 for invalid copy, with the reasons, and for a missing field or bad JSON", async () => {
    const study = await newStudy();

    const invalid = await put(study.id, {
      participantCopy: { intro: { tagline: "x".repeat(400) } },
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).fields.join(" ")).toMatch(/tagline is longer/);

    expect((await put(study.id, {})).status).toBe(400);
    expect((await put(study.id, "not json")).status).toBe(400);
  });

  it("answers 404 for an unknown study", async () => {
    expect((await put("missing", { participantCopy: null })).status).toBe(404);
  });
});
