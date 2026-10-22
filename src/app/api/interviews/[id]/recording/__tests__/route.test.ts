import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Interview } from "@/domain";
import type { PmContext } from "@/pm-auth";

const mocks = vi.hoisted(() => ({
  getCurrentPmContext: vi.fn(),
  getById: vi.fn(),
  fetchConversationAudio: vi.fn(),
}));

vi.mock("@/pm-auth/current-pm-context", () => ({ getCurrentPmContext: mocks.getCurrentPmContext }));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => ({ getById: mocks.getById }),
}));
vi.mock("@/lib/elevenlabs/client", () => ({
  fetchConversationAudio: mocks.fetchConversationAudio,
}));

import { GET } from "../route";

const interview = (overrides: Partial<Interview> = {}) =>
  ({
    id: "int-1",
    studyId: "study-1",
    status: "completed",
    mode: "voice",
    voiceProvider: "elevenlabs",
    elevenLabsConversationId: "conv-1",
    ...overrides,
  }) as Interview;

const ctx = (role: PmContext["role"], grantedStudyIds: string[] = []): PmContext => ({
  userId: "u",
  email: "u@example.com",
  role,
  grantedStudyIds,
});

const call = () =>
  GET(new Request("http://localhost/api/interviews/int-1/recording"), { params: { id: "int-1" } });

describe("GET /api/interviews/[id]/recording", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getById.mockResolvedValue(interview());
    mocks.fetchConversationAudio.mockResolvedValue(Buffer.from("audio-bytes"));
  });

  it("is 401 without a session, and does not look up the interview or fetch audio", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.getById).not.toHaveBeenCalled();
    expect(mocks.fetchConversationAudio).not.toHaveBeenCalled();
  });

  it("is 403 for a signed-in user with no role", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx(null));
    expect((await call()).status).toBe(403);
    expect(mocks.fetchConversationAudio).not.toHaveBeenCalled();
  });

  it("serves audio to an admin", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("admin"));
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("serves audio to a viewer granted the interview's study", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("viewer", ["study-1"]));
    expect((await call()).status).toBe(200);
  });

  it("is 404 for a viewer who was not granted the study", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("viewer", ["other-study"]));
    expect((await call()).status).toBe(404);
    expect(mocks.fetchConversationAudio).not.toHaveBeenCalled();
  });

  it("is 404 for a viewer asking for an interview that is not completed", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("viewer", ["study-1"]));
    mocks.getById.mockResolvedValue(interview({ status: "in-progress" }));
    expect((await call()).status).toBe(404);
    expect(mocks.fetchConversationAudio).not.toHaveBeenCalled();
  });

  it("is 404 for an unknown interview", async () => {
    mocks.getCurrentPmContext.mockResolvedValue(ctx("admin"));
    mocks.getById.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });
});
