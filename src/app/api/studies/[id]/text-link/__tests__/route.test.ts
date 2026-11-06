import { describe, expect, it, vi } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";

const repo = new InMemoryStudyRepository();
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => repo }));

import { POST } from "../route";

const post = (id: string) =>
  POST(new Request("http://localhost/api", { method: "POST" }), { params: { id } });

describe("POST /api/studies/[id]/text-link", () => {
  it("gives a feedback study without one a text link, and keeps it on a repeat", async () => {
    const study = await repo.create({
      title: "T",
      description: "D",
      type: "feedback",
      feedbackQuestions: ["Q"],
      preInterviewQuestions: [],
      linkToken: "voice-token",
    });

    const first = await (await post(study.id)).json();
    const again = await (await post(study.id)).json();

    expect(first.textLinkToken).toBeTruthy();
    expect(first.textLinkToken).not.toBe("voice-token");
    expect(again.textLinkToken).toBe(first.textLinkToken);
  });

  it("returns 404 for an unknown study", async () => {
    expect((await post("missing")).status).toBe(404);
  });
});
