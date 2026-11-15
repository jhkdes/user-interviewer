import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateApiKey, hashApiKey } from "@/partner-api";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryPartnerIdempotencyRepository } from "@/repositories/in-memory/in-memory-partner-idempotency-repository";
import { InMemoryPartnerInvitationRepository } from "@/repositories/in-memory/in-memory-partner-invitation-repository";
import { InMemoryPartnerRateLimitRepository } from "@/repositories/in-memory/in-memory-partner-rate-limit-repository";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";

let partners = new InMemoryPartnerRepository();
let studies = new InMemoryStudyRepository();
let invitations = new InMemoryPartnerInvitationRepository();
let interviews = new InMemoryInterviewRepository();
let rateLimits = new InMemoryPartnerRateLimitRepository();
let idempotency = new InMemoryPartnerIdempotencyRepository();
vi.mock("@/repositories/get-partner-repository", () => ({ getPartnerRepository: () => partners }));
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => studies }));
vi.mock("@/repositories/get-partner-invitation-repository", () => ({
  getPartnerInvitationRepository: () => invitations,
}));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => interviews,
}));
vi.mock("@/repositories/get-partner-rate-limit-repository", () => ({
  getPartnerRateLimitRepository: () => rateLimits,
}));
vi.mock("@/repositories/get-partner-idempotency-repository", () => ({
  getPartnerIdempotencyRepository: () => idempotency,
}));

import { GET as getMe } from "../me/route";
import { POST as postInvitation } from "../studies/[studyId]/invitations/route";
import { PATCH as patchStudy } from "../studies/[studyId]/route";
import { POST as postStudy } from "../studies/route";

const TRACKING = "k3Zq9vX1mT8wRb4Yp7NcHd";
let key: string;
let otherKey: string;

beforeEach(async () => {
  partners = new InMemoryPartnerRepository();
  studies = new InMemoryStudyRepository();
  invitations = new InMemoryPartnerInvitationRepository();
  interviews = new InMemoryInterviewRepository();
  rateLimits = new InMemoryPartnerRateLimitRepository();
  idempotency = new InMemoryPartnerIdempotencyRepository();
  key = generateApiKey();
  otherKey = generateApiKey();
  await partners.create({ name: "pfa-preview", keyHash: hashApiKey(key) });
  await partners.create({ name: "other", keyHash: hashApiKey(otherKey) });
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

const headers = (token = key, extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  ...extra,
});

const me = (token = key) =>
  getMe(new Request("http://ui.test/api/partner/v1/me", { headers: headers(token) }), {
    params: {},
  });

const studyBody = {
  ownerRef: "pfa_user_123",
  title: "Feedback for Jae Kim",
  subjectName: "Jae Kim",
  interviewPrompt: "Interview {{colleague_first_name}} about {{subject_name}}.",
};

const createStudy = (extra: Record<string, string> = {}, body: unknown = studyBody) =>
  postStudy(
    new Request("http://ui.test/api/partner/v1/studies", {
      method: "POST",
      headers: headers(key, extra),
      body: JSON.stringify(body),
    }),
    { params: {} },
  );

describe("rate limit", () => {
  it("answers 429 with Retry-After once a partner passes its minute's allowance, and not before", async () => {
    vi.stubEnv("PARTNER_API_RATE_LIMIT_PER_MINUTE", "3");
    vi.useFakeTimers({ now: new Date("2026-11-06T10:00:20.000Z") });

    for (let i = 0; i < 3; i++) expect((await me()).status).toBe(200);
    const limited = await me();

    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("40");
    expect(limited.headers.get("X-Request-Id")).toBeTruthy();
    const body = await limited.json();
    expect(body.error.code).toBe("rate_limited");
  });

  it("counts each partner on its own, and starts again in the next minute", async () => {
    vi.stubEnv("PARTNER_API_RATE_LIMIT_PER_MINUTE", "2");
    vi.useFakeTimers({ now: new Date("2026-11-06T10:00:00.000Z") });

    await me();
    await me();
    expect((await me()).status).toBe(429);
    expect((await me(otherKey)).status).toBe(200);

    vi.setSystemTime(new Date("2026-11-06T10:01:00.000Z"));
    expect((await me()).status).toBe(200);
  });

  it("defaults to 60 a minute when the setting is missing or nonsense", async () => {
    vi.stubEnv("PARTNER_API_RATE_LIMIT_PER_MINUTE", "lots");
    vi.useFakeTimers({ now: new Date("2026-11-06T10:00:00.000Z") });

    for (let i = 0; i < 60; i++) expect((await me()).status).toBe(200);
    expect((await me()).status).toBe(429);
  });

  it("does not count a request with a bad key", async () => {
    vi.stubEnv("PARTNER_API_RATE_LIMIT_PER_MINUTE", "1");
    vi.useFakeTimers({ now: new Date("2026-11-06T10:00:00.000Z") });

    expect((await me("uip_wrong")).status).toBe(401);
    expect((await me()).status).toBe(200);
  });

  it("lets requests through when the counter itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(rateLimits, "hit").mockRejectedValue(new Error("database down"));

    expect((await me()).status).toBe(200);
  });
});

describe("Idempotency-Key", () => {
  it("returns the first answer to a retry and does the work once", async () => {
    const create = vi.spyOn(studies, "create");
    const first = await createStudy({ "Idempotency-Key": "create-1" });
    expect(first.status).toBe(201);
    const created = await first.json();

    const retry = await createStudy({ "Idempotency-Key": "create-1" });
    expect(retry.status).toBe(201); // not 200: it is the first answer, replayed
    expect(retry.headers.get("Idempotent-Replayed")).toBe("true");
    expect(await retry.json()).toEqual(created);
    expect(first.headers.get("Idempotent-Replayed")).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("answers the retry with the retry's own request id", async () => {
    await createStudy({ "Idempotency-Key": "create-1", "X-Request-Id": "first" });
    const retry = await createStudy({ "Idempotency-Key": "create-1", "X-Request-Id": "second" });
    expect(retry.headers.get("X-Request-Id")).toBe("second");
  });

  it("refuses the same key for a different request with 409", async () => {
    await createStudy({ "Idempotency-Key": "create-1" });
    const other = await createStudy(
      { "Idempotency-Key": "create-1" },
      { ...studyBody, title: "A different title" },
    );
    expect(other.status).toBe(409);
    expect((await other.json()).error.code).toBe("conflict");
  });

  it("does not remember a failed request, so fixing it and retrying works", async () => {
    const bad = await createStudy({ "Idempotency-Key": "create-1" }, { ownerRef: "" });
    expect(bad.status).toBe(400);

    const good = await createStudy({ "Idempotency-Key": "create-1" });
    expect(good.status).toBe(201);
    expect(good.headers.get("Idempotent-Replayed")).toBeNull();
  });

  it("keeps one partner's keys apart from another's", async () => {
    await createStudy({ "Idempotency-Key": "shared-name" });
    const other = await postStudy(
      new Request("http://ui.test/api/partner/v1/studies", {
        method: "POST",
        headers: headers(otherKey, { "Idempotency-Key": "shared-name" }),
        body: JSON.stringify({ ...studyBody, title: "Theirs" }),
      }),
      { params: {} },
    );
    expect(other.status).toBe(201);
    expect(other.headers.get("Idempotent-Replayed")).toBeNull();
  });

  it("rejects a malformed key with 400", async () => {
    for (const bad of ["has space", "x".repeat(256), "café"]) {
      const response = await createStudy({ "Idempotency-Key": bad });
      expect(response.status).toBe(400);
    }
  });

  it("applies to invitations and study changes too", async () => {
    const { studyId } = await (await createStudy()).json();
    const owner = { "X-Owner-Ref": "pfa_user_123" };

    const invite = () =>
      postInvitation(
        new Request(`http://ui.test/api/partner/v1/studies/${studyId}/invitations`, {
          method: "POST",
          headers: headers(key, { ...owner, "Idempotency-Key": "inv-1" }),
          body: JSON.stringify({ trackingId: TRACKING, colleagueFirstName: "Priya" }),
        }),
        { params: { studyId } },
      );
    expect((await invite()).status).toBe(201);
    const again = await invite();
    expect(again.status).toBe(201);
    expect(again.headers.get("Idempotent-Replayed")).toBe("true");

    const patch = () =>
      patchStudy(
        new Request(`http://ui.test/api/partner/v1/studies/${studyId}`, {
          method: "PATCH",
          headers: headers(key, { ...owner, "Idempotency-Key": "patch-1" }),
          body: JSON.stringify({ title: "Renamed" }),
        }),
        { params: { studyId } },
      );
    expect((await patch()).status).toBe(200);
    expect((await patch()).headers.get("Idempotent-Replayed")).toBe("true");
  });

  it("ignores the header on reads", async () => {
    const response = await getMe(
      new Request("http://ui.test/api/partner/v1/me", {
        headers: headers(key, { "Idempotency-Key": "not a valid key!" }),
      }),
      { params: {} },
    );
    expect(response.status).toBe(200);
  });

  it("gives the work back when the request throws, so a retry runs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const spy = vi.spyOn(studies, "create").mockRejectedValueOnce(new Error("boom"));
    const failed = await createStudy({ "Idempotency-Key": "create-1" });
    expect(failed.status).toBe(500);
    spy.mockRestore();

    const retry = await createStudy({ "Idempotency-Key": "create-1" });
    expect(retry.status).toBe(201);
  });
});
