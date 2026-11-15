import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateApiKey, hashApiKey } from "@/partner-api";
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

import { GET as getInvitation } from "../studies/[studyId]/invitations/[trackingId]/route";
import {
  GET as listInvitations,
  POST as postInvitation,
} from "../studies/[studyId]/invitations/route";
import { GET as getStudy, PATCH as patchStudy } from "../studies/[studyId]/route";
import { POST as postStudy } from "../studies/route";

const TRACKING = "k3Zq9vX1mT8wRb4Yp7NcHd";
const TRACKING_2 = "Zx81QpL0aVn3Rt6Ym9KsWe";

let keyA: string;
let keyB: string;

beforeEach(async () => {
  partners = new InMemoryPartnerRepository();
  studies = new InMemoryStudyRepository();
  invitations = new InMemoryPartnerInvitationRepository();
  interviews = new InMemoryInterviewRepository();
  keyA = generateApiKey();
  keyB = generateApiKey();
  await partners.create({ name: "pfa-preview", keyHash: hashApiKey(keyA) });
  await partners.create({ name: "other-partner", keyHash: hashApiKey(keyB) });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const headers = (key: string, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  ...extra,
});

const studyBody = {
  ownerRef: "pfa_user_123",
  title: "Feedback for Jae Kim",
  subjectName: "Jae Kim",
  interviewPrompt: "Interview {{colleague_first_name}} about {{subject_name}}.",
};

async function createStudy(key = keyA, body: unknown = studyBody) {
  return postStudy(
    new Request("http://ui.test/api/partner/v1/studies", {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify(body),
    }),
    { params: {} },
  );
}

const withStudy = (studyId: string, key = keyA, owner: string | null = "pfa_user_123") =>
  headers(key, owner === null ? {} : { "X-Owner-Ref": owner });

async function studyId(): Promise<string> {
  return (await (await createStudy()).json()).studyId;
}

const invite = (id: string, body: unknown, key = keyA, owner: string | null = "pfa_user_123") =>
  postInvitation(
    new Request(`http://ui.test/api/partner/v1/studies/${id}/invitations`, {
      method: "POST",
      headers: withStudy(id, key, owner),
      body: JSON.stringify(body),
    }),
    { params: { studyId: id } },
  );

describe("POST /studies", () => {
  it("creates a feedback-type study owned by the partner, with a voice link and a text link", async () => {
    const res = await createStudy();
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(body).toMatchObject({
      ownerRef: "pfa_user_123",
      voiceProvider: "elevenlabs",
      title: "Feedback for Jae Kim",
      subjectName: "Jae Kim",
      interviewPrompt: studyBody.interviewPrompt,
      firstMessage: null,
      closingQuestion: null,
      timing: { targetMinutes: 5, hardStopMinutes: 7 },
      endedEarlyMinTurns: 4,
      participantSummaryEmail: false,
      landingCopy: {},
    });
    expect(Date.parse(body.expiresAt) - Date.parse(body.createdAt)).toBe(7 * 24 * 3600 * 1000);

    const stored = await studies.getById(body.studyId);
    expect(stored).toMatchObject({
      type: "feedback",
      voiceProvider: "elevenlabs",
      ownerRef: "pfa_user_123",
      feedbackQuestions: [],
    });
    expect(stored?.partnerId).toBeTruthy();
    expect(stored?.linkToken).toBeTruthy();
    expect(stored?.textLinkToken).toBeTruthy();
  });

  it("is idempotent on the owner: a second call returns the same study with 200 and ignores the body", async () => {
    const first = await (await createStudy()).json();

    const again = await createStudy(keyA, { ...studyBody, title: "A different title" });
    const body = await again.json();

    expect(again.status).toBe(200);
    expect(body.studyId).toBe(first.studyId);
    expect(body.title).toBe("Feedback for Jae Kim");
    expect((await studies.list()).length).toBe(1);
  });

  it("gives two partners separate studies for the same owner id", async () => {
    const a = await (await createStudy(keyA)).json();
    const b = await (await createStudy(keyB)).json();

    expect(a.studyId).not.toBe(b.studyId);
  });

  it("answers 422 unsupported_provider for vapi, and 400 with every problem for a bad body", async () => {
    const vapi = await createStudy(keyA, { ...studyBody, voiceProvider: "vapi" });
    expect(vapi.status).toBe(422);
    expect((await vapi.json()).error.code).toBe("unsupported_provider");

    const bad = await createStudy(keyA, { title: 5, timing: { hardStopMinutes: 99 } });
    const body = await bad.json();
    expect(bad.status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.details.length).toBeGreaterThan(2);
    expect(await studies.list()).toHaveLength(0);
  });

  it("answers 400 for a body that is not JSON, and 401 without a key", async () => {
    const notJson = await postStudy(
      new Request("http://ui.test/x", { method: "POST", headers: headers(keyA), body: "{nope" }),
      { params: {} },
    );
    expect(notJson.status).toBe(400);

    const noKey = await postStudy(
      new Request("http://ui.test/x", { method: "POST", body: JSON.stringify(studyBody) }),
      { params: {} },
    );
    expect(noKey.status).toBe(401);
  });

  it("stores the landing text where the dashboard editor keeps it", async () => {
    const res = await createStudy(keyA, {
      ...studyBody,
      landingCopy: { tagline: "Hello", endingTitle: "Thanks!", showFaq: true },
    });
    const body = await res.json();

    expect(body.landingCopy).toEqual({ tagline: "Hello", endingTitle: "Thanks!", showFaq: true });
    expect((await studies.getById(body.studyId))?.participantCopy).toEqual({
      intro: { tagline: "Hello", showFaq: true },
      completion: { title: "Thanks!" },
    });
  });
});

describe("GET and PATCH /studies/{id}", () => {
  it("reads a study back, only with the matching X-Owner-Ref", async () => {
    const id = await studyId();
    const call = (owner: string | null, key = keyA) =>
      getStudy(
        new Request(`http://ui.test/api/partner/v1/studies/${id}`, {
          headers: withStudy(id, key, owner),
        }),
        { params: { studyId: id } },
      );

    expect((await call("pfa_user_123")).status).toBe(200);
    expect((await call(null)).status).toBe(400);
    expect((await call("pfa_user_999")).status).toBe(409);
    expect((await call("pfa_user_123", keyB)).status).toBe(404);
  });

  it("changes the prompt and settings, and refuses to change the provider, owner or subject", async () => {
    const id = await studyId();
    const patch = (body: unknown) =>
      patchStudy(
        new Request(`http://ui.test/api/partner/v1/studies/${id}`, {
          method: "PATCH",
          headers: withStudy(id),
          body: JSON.stringify(body),
        }),
        { params: { studyId: id } },
      );

    const ok = await patch({
      interviewPrompt: "A better prompt",
      timing: { hardStopMinutes: 10 },
      closingQuestion: "Anything else about {{subject_name}}?",
      landingCopy: { consentNote: "You agree by starting." },
    });
    const body = await ok.json();
    expect(ok.status).toBe(200);
    expect(body).toMatchObject({
      interviewPrompt: "A better prompt",
      timing: { targetMinutes: 5, hardStopMinutes: 10 },
      closingQuestion: "Anything else about {{subject_name}}?",
      landingCopy: { consentNote: "You agree by starting." },
    });

    const conflict = await patch({ voiceProvider: "vapi" });
    expect(conflict.status).toBe(409);
    expect((await conflict.json()).error.code).toBe("conflict");
    expect((await patch({ subjectName: "Someone Else" })).status).toBe(409);
    expect((await patch({ timing: { hardStopMinutes: 40 } })).status).toBe(400);
    expect((await studies.getById(id))?.hardStopMinutes).toBe(10);
  });

  it("does not let another partner read or change the study", async () => {
    const id = await studyId();

    const res = await patchStudy(
      new Request(`http://ui.test/api/partner/v1/studies/${id}`, {
        method: "PATCH",
        headers: withStudy(id, keyB),
        body: JSON.stringify({ title: "hijacked" }),
      }),
      { params: { studyId: id } },
    );

    expect(res.status).toBe(404);
    expect((await studies.getById(id))?.title).toBe("Feedback for Jae Kim");
  });
});

describe("POST /studies/{id}/invitations", () => {
  it("creates an invitation with a link to the study's page that carries the tracking id", async () => {
    const id = await studyId();

    const res = await invite(id, {
      trackingId: TRACKING,
      colleagueFirstName: "Priya",
      context: { workContext: "We worked together on billing." },
    });
    const body = await res.json();
    const study = await studies.getById(id);

    expect(res.status).toBe(201);
    expect(body).toMatchObject({
      trackingId: TRACKING,
      colleagueFirstName: "Priya",
      status: "not_started",
      interviews: [],
      url: `http://ui.test/interview/${study?.linkToken}?tracking_id=${TRACKING}`,
    });
  });

  it("re-issuing the same tracking id updates the context and keeps the same URL", async () => {
    const id = await studyId();
    const first = await (
      await invite(id, { trackingId: TRACKING, colleagueFirstName: "Priya", context: { a: "1" } })
    ).json();

    const again = await invite(id, {
      trackingId: TRACKING,
      colleagueFirstName: "Priya R",
      context: { a: "2" },
    });
    const body = await again.json();

    expect(again.status).toBe(200);
    expect(body.invitationId).toBe(first.invitationId);
    expect(body.url).toBe(first.url);
    expect(body).toMatchObject({ colleagueFirstName: "Priya R", context: { a: "2" } });
    expect((await invitations.listByStudyId(id)).items).toHaveLength(1);
  });

  it("extends the study's expiry to a fresh seven days on every call, new or repeat, and never shortens it", async () => {
    const id = await studyId();
    const nearlyExpired = new Date(Date.now() - 6 * 24 * 3600 * 1000);
    await studies.updateDetails(id, {});
    vi.useFakeTimers();
    try {
      vi.setSystemTime(nearlyExpired);
      await studies.extendLink(id);
    } finally {
      vi.useRealTimers();
    }
    const before = await studies.getById(id);
    expect(before?.linkExtendedAt?.getTime()).toBeLessThan(Date.now() - 5 * 24 * 3600 * 1000);

    const res = await invite(id, { trackingId: TRACKING, colleagueFirstName: "Priya" });
    const expiresAt = Date.parse((await res.json()).expiresAt);

    expect(expiresAt).toBeGreaterThanOrEqual(Date.now() + 7 * 24 * 3600 * 1000 - 5000);
    const again = await invite(id, { trackingId: TRACKING_2, colleagueFirstName: "Sam" });
    expect(Date.parse((await again.json()).expiresAt)).toBeGreaterThanOrEqual(expiresAt);
  });

  it("rejects a tracking id that could be guessed, with 422 invalid_tracking_id", async () => {
    const id = await studyId();

    const res = await invite(id, { trackingId: "pfa_req_456", colleagueFirstName: "Priya" });

    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("invalid_tracking_id");
    expect((await invitations.listByStudyId(id)).items).toHaveLength(0);
  });

  it("requires the owner header, and another partner gets 404", async () => {
    const id = await studyId();
    const body = { trackingId: TRACKING, colleagueFirstName: "Priya" };

    expect((await invite(id, body, keyA, null)).status).toBe(400);
    expect((await invite(id, body, keyA, "pfa_user_999")).status).toBe(409);
    expect((await invite(id, body, keyB)).status).toBe(404);
  });

  it("refuses an invitation to a study that was closed in the dashboard", async () => {
    const id = await studyId();
    await studies.updateStatus(id, "closed");

    const res = await invite(id, { trackingId: TRACKING, colleagueFirstName: "Priya" });

    expect(res.status).toBe(409);
  });
});

describe("reading invitations", () => {
  async function seed() {
    const id = await studyId();
    const priya = await (
      await invite(id, { trackingId: TRACKING, colleagueFirstName: "Priya" })
    ).json();
    // Listing is oldest first; keep the two creation times apart so the order is certain.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await invite(id, { trackingId: TRACKING_2, colleagueFirstName: "Sam" });
    return { id, priya };
  }

  const get = (id: string, trackingId: string, key = keyA) =>
    getInvitation(
      new Request(`http://ui.test/api/partner/v1/studies/${id}/invitations/${trackingId}`, {
        headers: withStudy(id, key),
      }),
      { params: { studyId: id, trackingId } },
    );

  it("reports not_started, then pending, then completed as interviews come in", async () => {
    const { id, priya } = await seed();
    expect((await (await get(id, TRACKING)).json()).status).toBe("not_started");

    const first = await interviews.create({
      studyId: id,
      firstName: "Priya",
      email: "p@example.com",
      voiceProvider: "elevenlabs",
    });
    await interviews.update(first.id, { invitationId: priya.invitationId });
    const pending = await (await get(id, TRACKING)).json();
    expect(pending.status).toBe("pending");
    expect(pending.interviews).toEqual([
      { interviewId: first.id, status: "pending", endCause: null, startedAt: null, endedAt: null },
    ]);

    await interviews.update(first.id, {
      status: "completed",
      endCause: "interrupted",
      startedAt: new Date("2026-11-05T10:00:00Z"),
      completedAt: new Date("2026-11-05T10:02:00Z"),
    });
    const dropped = await (await get(id, TRACKING)).json();
    expect(dropped.status).toBe("completed");
    expect(dropped.interviews[0]).toMatchObject({
      status: "completed",
      endCause: "interrupted",
      startedAt: "2026-11-05T10:00:00.000Z",
      endedAt: "2026-11-05T10:02:00.000Z",
    });
  });

  it("lists a restart as a second interview under the same invitation, oldest first", async () => {
    const { id, priya } = await seed();
    const a = await interviews.create({ studyId: id, firstName: "P", email: "p@x.co" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const b = await interviews.create({ studyId: id, firstName: "P", email: "p@x.co" });
    await interviews.update(a.id, {
      invitationId: priya.invitationId,
      status: "completed",
      endCause: "interrupted",
    });
    await interviews.update(b.id, {
      invitationId: priya.invitationId,
      status: "completed",
      endCause: "finished",
    });

    const body = await (await get(id, TRACKING)).json();

    expect(body.interviews.map((i: { interviewId: string }) => i.interviewId)).toEqual([
      a.id,
      b.id,
    ]);
    expect(body.interviews.map((i: { endCause: string }) => i.endCause)).toEqual([
      "interrupted",
      "finished",
    ]);
  });

  it("returns 404 for an unknown tracking id and for another partner's study", async () => {
    const { id } = await seed();

    expect((await get(id, "u".repeat(22))).status).toBe(404);
    expect((await get(id, TRACKING, keyB)).status).toBe(404);
  });

  it("lists invitations a page at a time, never showing another study's", async () => {
    const { id } = await seed();
    const call = (query: string) =>
      listInvitations(
        new Request(`http://ui.test/api/partner/v1/studies/${id}/invitations${query}`, {
          headers: withStudy(id),
        }),
        { params: { studyId: id } },
      );

    const firstPage = await (await call("?limit=1")).json();
    expect(firstPage.invitations).toHaveLength(1);
    expect(firstPage.invitations[0].trackingId).toBe(TRACKING);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await (
      await call(`?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor)}`)
    ).json();
    expect(secondPage.invitations.map((i: { trackingId: string }) => i.trackingId)).toEqual([
      TRACKING_2,
    ]);
    expect(secondPage.nextCursor).toBeNull();

    expect((await call("?limit=0")).status).toBe(400);
    expect((await call("?cursor=garbage")).status).toBe(400);
  });
});
