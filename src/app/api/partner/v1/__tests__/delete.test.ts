import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cachedAudio,
  clearAudioCache,
  generateApiKey,
  hashApiKey,
  rememberAudio,
} from "@/partner-api";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryPartnerInvitationRepository } from "@/repositories/in-memory/in-memory-partner-invitation-repository";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";

let partners = new InMemoryPartnerRepository();
let studies = new InMemoryStudyRepository();
let invitations = new InMemoryPartnerInvitationRepository();
let interviews = new InMemoryInterviewRepository();
vi.mock("@/repositories/get-partner-repository", () => ({ getPartnerRepository: () => partners }));
vi.mock("@/repositories/get-partner-rate-limit-repository", async () => {
  const { InMemoryPartnerRateLimitRepository } =
    await import("@/repositories/in-memory/in-memory-partner-rate-limit-repository");
  return { getPartnerRateLimitRepository: () => new InMemoryPartnerRateLimitRepository() };
});
vi.mock("@/repositories/get-partner-idempotency-repository", async () => {
  const { InMemoryPartnerIdempotencyRepository } =
    await import("@/repositories/in-memory/in-memory-partner-idempotency-repository");
  return { getPartnerIdempotencyRepository: () => new InMemoryPartnerIdempotencyRepository() };
});
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => studies }));
vi.mock("@/repositories/get-partner-invitation-repository", () => ({
  getPartnerInvitationRepository: () => invitations,
}));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => interviews,
}));
const deleteConversation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/elevenlabs/client", () => ({ deleteConversationResult: deleteConversation }));

import { DELETE as deleteInterview } from "../interviews/[interviewId]/route";
import { DELETE as deleteStudy } from "../studies/[studyId]/route";

let keyA: string;
let keyB: string;
let partnerAId: string;

beforeEach(async () => {
  partners = new InMemoryPartnerRepository();
  studies = new InMemoryStudyRepository();
  invitations = new InMemoryPartnerInvitationRepository();
  interviews = new InMemoryInterviewRepository();
  clearAudioCache();
  deleteConversation.mockReset();
  deleteConversation.mockResolvedValue("deleted");
  keyA = generateApiKey();
  keyB = generateApiKey();
  partnerAId = (await partners.create({ name: "pfa-preview", keyHash: hashApiKey(keyA) })).id;
  await partners.create({ name: "other", keyHash: hashApiKey(keyB) });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

/** A partner study with two colleagues, each with a finished voice interview. */
async function seed(ownerRef = "pfa_user_123") {
  const study = await studies.create({
    type: "feedback",
    title: "Feedback",
    description: "Jae",
    preInterviewQuestions: [],
    linkToken: `l-${ownerRef}`,
    partnerId: partnerAId,
    ownerRef,
    voiceProvider: "elevenlabs",
  });
  const made = [];
  for (const name of ["Priya", "Sam"]) {
    const invitation = await invitations.create({
      studyId: study.id,
      trackingId: `${name}-${ownerRef}`.padEnd(22, "x"),
      colleagueFirstName: name,
      context: {},
    });
    const interview = await interviews.create({
      studyId: study.id,
      firstName: name,
      email: `${name}@example.com`,
      voiceProvider: "elevenlabs",
    });
    await interviews.update(interview.id, {
      invitationId: invitation.id,
      status: "completed",
      elevenLabsConversationId: `conv-${name}-${ownerRef}`,
      transcript: [{ speaker: "participant", text: "hi", timestampMs: 0 }],
    });
    made.push({
      invitation,
      interviewId: interview.id,
      conversationId: `conv-${name}-${ownerRef}`,
    });
  }
  return { study, made };
}

const removeStudy = (id: string, key = keyA, owner: string | null = "pfa_user_123") =>
  deleteStudy(
    new Request(`http://ui.test/api/partner/v1/studies/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, ...(owner ? { "X-Owner-Ref": owner } : {}) },
    }),
    { params: { studyId: id } },
  );

const removeInterview = (id: string, key = keyA, headers: Record<string, string> = {}) =>
  deleteInterview(
    new Request(`http://ui.test/api/partner/v1/interviews/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, ...headers },
    }),
    { params: { interviewId: id } },
  );

describe("DELETE /studies/{id}", () => {
  it("deletes every recording at the provider, then the interviews and the study, and answers 204", async () => {
    const { study, made } = await seed();

    const res = await removeStudy(study.id);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(deleteConversation.mock.calls.map((c) => c[0]).sort()).toEqual(
      made.map((m) => m.conversationId).sort(),
    );
    expect(await studies.getById(study.id)).toBeNull();
    expect(await interviews.listByStudyId(study.id)).toEqual([]);
  });

  it("deletes nothing at all when a recording cannot be removed, so the call can be repeated", async () => {
    const { study, made } = await seed();
    deleteConversation.mockImplementation(async (id: string) =>
      id === made[1].conversationId ? "failed" : "deleted",
    );

    const res = await removeStudy(study.id);
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error.code).toBe("provider_error");
    expect(await studies.getById(study.id)).not.toBeNull();
    expect(await interviews.listByStudyId(study.id)).toHaveLength(2);

    // The retry succeeds, and a recording ElevenLabs no longer has counts as already removed.
    deleteConversation.mockImplementation(async (id: string) =>
      id === made[0].conversationId ? "missing" : "deleted",
    );
    expect((await removeStudy(study.id)).status).toBe(204);
    expect(await studies.getById(study.id)).toBeNull();
  });

  it("deletes a study with no interviews or recordings without calling the provider", async () => {
    const study = await studies.create({
      type: "feedback",
      title: "Empty",
      description: "x",
      preInterviewQuestions: [],
      linkToken: "empty",
      partnerId: partnerAId,
      ownerRef: "pfa_user_123",
    });

    expect((await removeStudy(study.id)).status).toBe(204);
    expect(deleteConversation).not.toHaveBeenCalled();
  });

  it("requires the owner header and the right owner, and leaves everything in place otherwise", async () => {
    const { study } = await seed();

    expect((await removeStudy(study.id, keyA, null)).status).toBe(400);
    expect((await removeStudy(study.id, keyA, "pfa_user_999")).status).toBe(409);
    expect(deleteConversation).not.toHaveBeenCalled();
    expect(await studies.getById(study.id)).not.toBeNull();
  });

  it("does not let another partner delete it, and a second delete after success is a 404", async () => {
    const { study } = await seed();

    expect((await removeStudy(study.id, keyB)).status).toBe(404);
    expect(await studies.getById(study.id)).not.toBeNull();
    expect((await removeStudy(study.id)).status).toBe(204);
    expect((await removeStudy(study.id)).status).toBe(404);
  });

  it("leaves other studies untouched", async () => {
    const mine = await seed("pfa_user_123");
    const other = await seed("pfa_user_456");

    await removeStudy(mine.study.id);

    expect(await studies.getById(other.study.id)).not.toBeNull();
    expect(await interviews.listByStudyId(other.study.id)).toHaveLength(2);
  });

  it("forgets a cached copy of the recording", async () => {
    const { study, made } = await seed();
    rememberAudio(made[0].conversationId, Buffer.from("audio"));

    await removeStudy(study.id);

    expect(cachedAudio(made[0].conversationId)).toBeNull();
  });
});

describe("DELETE /interviews/{id}", () => {
  it("deletes the recording and the interview only, and the invitation goes back to not started", async () => {
    const { study, made } = await seed();

    const res = await removeInterview(made[0].interviewId);

    expect(res.status).toBe(204);
    expect(deleteConversation).toHaveBeenCalledTimes(1);
    expect(deleteConversation).toHaveBeenCalledWith(made[0].conversationId);
    expect(await interviews.getById(made[0].interviewId)).toBeNull();
    // The colleague's invitation and the other interview are still there.
    expect(await invitations.getById(made[0].invitation.id)).not.toBeNull();
    expect(await interviews.getById(made[1].interviewId)).not.toBeNull();
    expect(await studies.getById(study.id)).not.toBeNull();
  });

  it("keeps the interview when the recording cannot be removed", async () => {
    const { made } = await seed();
    deleteConversation.mockResolvedValue("failed");

    const res = await removeInterview(made[0].interviewId);

    expect(res.status).toBe(502);
    expect(await interviews.getById(made[0].interviewId)).not.toBeNull();
  });

  it("deletes a typed interview, which has no recording, without calling the provider", async () => {
    const { made } = await seed();
    await interviews.update(made[0].interviewId, { elevenLabsConversationId: null, mode: "text" });

    expect((await removeInterview(made[0].interviewId)).status).toBe(204);
    expect(deleteConversation).not.toHaveBeenCalled();
  });

  it("is a 404 for another partner and for an interview that is already gone; a wrong X-Owner-Ref is a 409", async () => {
    const { made } = await seed();

    expect((await removeInterview(made[0].interviewId, keyB)).status).toBe(404);
    expect(
      (await removeInterview(made[0].interviewId, keyA, { "X-Owner-Ref": "someone_else" })).status,
    ).toBe(409);
    expect(await interviews.getById(made[0].interviewId)).not.toBeNull();
    expect((await removeInterview(made[0].interviewId)).status).toBe(204);
    expect((await removeInterview(made[0].interviewId)).status).toBe(404);
  });
});
