import { afterEach, describe, expect, it, vi } from "vitest";
import { generateApiKey, hashApiKey } from "@/partner-api";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import type { PartnerRepository } from "@/repositories/partner-repository";

let repo: PartnerRepository = new InMemoryPartnerRepository();
vi.mock("@/repositories/get-partner-repository", () => ({ getPartnerRepository: () => repo }));

import { GET } from "../route";

afterEach(() => vi.restoreAllMocks());

const call = (headers: Record<string, string> = {}) =>
  GET(new Request("http://localhost/api/partner/v1/me", { headers }), { params: {} });

describe("GET /api/partner/v1/me", () => {
  it("returns the partner behind a valid key, with a request id, and never the key or its hash", async () => {
    repo = new InMemoryPartnerRepository();
    const key = generateApiKey();
    const partner = await repo.create({ name: "pfa-preview", keyHash: hashApiKey(key) });
    vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await call({ Authorization: `Bearer ${key}`, "X-Request-Id": "abc-123" });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("abc-123");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ partner: { id: partner.id, name: "pfa-preview" } });
    expect(text).not.toContain(key);
    expect(text).not.toContain(hashApiKey(key));
  });

  it("answers 401 without a key and 401 after the partner is revoked", async () => {
    repo = new InMemoryPartnerRepository();
    const key = generateApiKey();
    const partner = await repo.create({ name: "p", keyHash: hashApiKey(key) });
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect((await call()).status).toBe(401);
    expect((await call({ Authorization: `Bearer ${key}` })).status).toBe(200);
    await repo.revoke(partner.id);
    expect((await call({ Authorization: `Bearer ${key}` })).status).toBe(401);
  });

  it("generates a request id when the caller's is unusable", async () => {
    repo = new InMemoryPartnerRepository();
    vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await call({ "X-Request-Id": "bad id with spaces" });

    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("turns an unexpected failure into a 500 that does not leak the cause, and logs no key", async () => {
    const key = generateApiKey();
    repo = {
      list: async () => {
        throw new Error("connection string postgres://secret");
      },
    } as unknown as PartnerRepository;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoLog = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await call({ Authorization: `Bearer ${key}` });

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      error: { code: "internal", message: "Something went wrong." },
    });
    expect(text).not.toContain("secret");
    const logged = JSON.stringify([...errorLog.mock.calls, ...infoLog.mock.calls]);
    expect(logged).not.toContain(key);
  });

  it("logs one line per request with the partner, path and status", async () => {
    repo = new InMemoryPartnerRepository();
    const key = generateApiKey();
    await repo.create({ name: "pfa-preview", keyHash: hashApiKey(key) });
    const infoLog = vi.spyOn(console, "log").mockImplementation(() => {});

    await call({ Authorization: `Bearer ${key}` });

    expect(infoLog).toHaveBeenCalledTimes(1);
    expect(String(infoLog.mock.calls[0][0])).toMatch(
      /\[partner-api\] \S+ pfa-preview GET \/api\/partner\/v1\/me -> 200/,
    );
    expect(String(infoLog.mock.calls[0][0])).not.toContain(key);
  });
});
