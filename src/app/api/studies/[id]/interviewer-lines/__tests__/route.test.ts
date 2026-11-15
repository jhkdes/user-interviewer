import { describe, expect, it, vi } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { createStudy } from "@/study-service";

const repo = new InMemoryStudyRepository();
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => repo }));

import { PUT } from "../route";

const put = (id: string, body: unknown) =>
  PUT(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify(body) }), {
    params: { id },
  });

describe("PUT /api/studies/[id]/interviewer-lines", () => {
  it("saves the lines for a feedback study", async () => {
    const study = await createStudy(repo, {
      title: "T",
      description: "D",
      type: "feedback",
      feedbackQuestions: ["Q"],
      preInterviewQuestions: [],
    });

    const res = await put(study.id, { firstMessage: "Hello!", closingQuestion: "Anything else?" });

    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.firstMessage).toBe("Hello!");
    expect(saved.closingQuestion).toBe("Anything else?");
  });

  it("returns 400 for a bad line or a discovery study, and 404 for an unknown study", async () => {
    const feedback = await createStudy(repo, {
      title: "T",
      description: "D",
      type: "feedback",
      feedbackQuestions: ["Q"],
      preInterviewQuestions: [],
    });
    const discovery = await createStudy(repo, {
      title: "T",
      description: "D",
      preInterviewQuestions: [],
    });

    expect((await put(feedback.id, { firstMessage: "x".repeat(400) })).status).toBe(400);
    expect((await put(discovery.id, { firstMessage: "Hi" })).status).toBe(400);
    expect((await put("missing", { firstMessage: "Hi" })).status).toBe(404);
  });
});
