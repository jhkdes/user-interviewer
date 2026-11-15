import { describe, expect, it } from "vitest";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import { API_KEY_PREFIX, generateApiKey, hashApiKey } from "../api-key";
import { authenticatePartner } from "../authenticate";

async function setup() {
  const repo = new InMemoryPartnerRepository();
  const key = generateApiKey();
  const partner = await repo.create({ name: "pfa-preview", keyHash: hashApiKey(key) });
  await repo.create({ name: "pfa-production", keyHash: hashApiKey(generateApiKey()) });
  return { repo, key, partner };
}

const withAuth = (value?: string) =>
  new Request("http://localhost/api/partner/v1/me", {
    headers: value === undefined ? {} : { Authorization: value },
  });

describe("API keys", () => {
  it("are prefixed, long and different every time", () => {
    const a = generateApiKey();
    const b = generateApiKey();

    expect(a.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(b);
  });

  it("hash to a stable 64-character hex digest that does not contain the key", () => {
    const key = generateApiKey();

    expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey(key)).toBe(hashApiKey(key));
    expect(hashApiKey(key)).not.toContain(key);
    expect(hashApiKey(key)).not.toBe(hashApiKey(generateApiKey()));
  });
});

describe("authenticatePartner", () => {
  it("accepts a valid key and returns the partner it belongs to", async () => {
    const { repo, key, partner } = await setup();

    const result = await authenticatePartner(withAuth(`Bearer ${key}`), repo, "req-1");

    expect(result).toMatchObject({ ok: true, partner: { id: partner.id, name: "pfa-preview" } });
  });

  it("tells two partners apart by their keys", async () => {
    const repo = new InMemoryPartnerRepository();
    const keyA = generateApiKey();
    const keyB = generateApiKey();
    await repo.create({ name: "a", keyHash: hashApiKey(keyA) });
    const b = await repo.create({ name: "b", keyHash: hashApiKey(keyB) });

    const result = await authenticatePartner(withAuth(`Bearer ${keyB}`), repo, "req-1");

    expect(result).toMatchObject({ ok: true, partner: { id: b.id } });
  });

  it.each([
    ["no Authorization header", undefined],
    ["an empty value", ""],
    ["a non-Bearer scheme", "Basic abc"],
    ["a Bearer with no key", "Bearer"],
    ["an unknown key", `Bearer ${generateApiKey()}`],
    ["a key with an extra word", "Bearer a b"],
  ])("rejects %s with a 401 and the standard error body", async (_label, header) => {
    const { repo } = await setup();

    const result = await authenticatePartner(withAuth(header), repo, "req-7");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(result.response.headers.get("www-authenticate")).toBe("Bearer");
    expect(result.response.headers.get("x-request-id")).toBe("req-7");
    expect(await result.response.json()).toEqual({
      error: { code: "unauthorized", message: "Missing or invalid API key." },
    });
  });

  it("rejects a revoked partner's key exactly like an unknown one", async () => {
    const { repo, key, partner } = await setup();
    await repo.revoke(partner.id);

    const revoked = await authenticatePartner(withAuth(`Bearer ${key}`), repo, "r");
    const unknown = await authenticatePartner(withAuth(`Bearer ${generateApiKey()}`), repo, "r");

    if (revoked.ok || unknown.ok) throw new Error("expected both to be rejected");
    expect(revoked.response.status).toBe(401);
    expect(await revoked.response.text()).toBe(await unknown.response.text());
  });

  it("does not accept the stored hash as if it were the key", async () => {
    const { repo, partner } = await setup();

    const result = await authenticatePartner(withAuth(`Bearer ${partner.keyHash}`), repo, "r");

    expect(result.ok).toBe(false);
  });
});
