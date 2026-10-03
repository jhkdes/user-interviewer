import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";

const repo = { current: new InMemoryInterviewRepository() };
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => repo.current,
}));
const fetchConversationAudio = vi.fn();
vi.mock("@/lib/elevenlabs/client", () => ({
  fetchConversationAudio: (id: string) => fetchConversationAudio(id),
}));

import { GET } from "../route";

afterEach(() => {
  fetchConversationAudio.mockReset();
});

function get(id: string) {
  return GET(new Request(`http://localhost/api/interviews/${id}/recording`), { params: { id } });
}

async function interviewWith(fields: Parameters<InMemoryInterviewRepository["update"]>[1]) {
  repo.current = new InMemoryInterviewRepository();
  const created = await repo.current.create({
    studyId: "study-1",
    firstName: "Sam",
    email: "sam@example.com",
    voiceProvider: "elevenlabs",
  });
  return repo.current.update(created.id, fields);
}

describe("GET /api/interviews/[id]/recording", () => {
  it("streams an ElevenLabs voice interview's audio", async () => {
    const interview = await interviewWith({ elevenLabsConversationId: "conv-1" });
    fetchConversationAudio.mockResolvedValue(Buffer.from("audio-bytes"));

    const response = await get(interview.id);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(fetchConversationAudio).toHaveBeenCalledWith("conv-1");
  });

  it("answers 404 for a typed interview without asking ElevenLabs, even if it somehow has a conversation id", async () => {
    const interview = await interviewWith({ mode: "text", elevenLabsConversationId: "conv-1" });

    const response = await get(interview.id);

    expect(response.status).toBe(404);
    expect(fetchConversationAudio).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown interview", async () => {
    await interviewWith({});

    expect((await get("00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });
});
