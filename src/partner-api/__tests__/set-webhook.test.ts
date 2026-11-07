import { describe, expect, it } from "vitest";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import {
  InvalidWebhookUrlError,
  PartnerNotFoundError,
  rotateWebhookSecret,
  setPartnerWebhook,
  webhookUrlProblem,
} from "../set-webhook";

const URL_ = "https://pfa.example.com/hooks/ui";

describe("webhookUrlProblem", () => {
  it("accepts an https address", () => {
    expect(webhookUrlProblem(URL_)).toBeNull();
    expect(webhookUrlProblem("https://abc.ngrok.app/hooks/ui?x=1")).toBeNull();
  });

  it.each([
    ["http://pfa.example.com/hook", /https/],
    ["ftp://pfa.example.com/hook", /https/],
    ["pfa.example.com/hook", /not a valid address/],
    ["", /not a valid address/],
    ["https://user:secret@pfa.example.com/hook", /username or password/],
  ])("rejects %s", (value, message) => {
    expect(webhookUrlProblem(value)).toMatch(message);
  });
});

describe("setPartnerWebhook", () => {
  it("sets the address and keeps the existing secret", async () => {
    const partners = new InMemoryPartnerRepository();
    await partners.create({
      name: "pfa-preview",
      keyHash: "a".repeat(64),
      webhookSecret: "whsec_existing",
    });

    const { partner, newSecret } = await setPartnerWebhook(partners, "pfa-preview", URL_);

    expect(partner).toMatchObject({ webhookUrl: URL_, webhookSecret: "whsec_existing" });
    expect(newSecret).toBeNull();
  });

  it("changes an address that was already set, leaving the secret alone", async () => {
    const partners = new InMemoryPartnerRepository();
    await partners.create({
      name: "pfa-preview",
      keyHash: "a".repeat(64),
      webhookUrl: "https://old.example.com/hook",
      webhookSecret: "whsec_existing",
    });

    const { partner } = await setPartnerWebhook(partners, "pfa-preview", URL_);

    expect(partner).toMatchObject({ webhookUrl: URL_, webhookSecret: "whsec_existing" });
  });

  it("creates a secret, once, for a partner that has none", async () => {
    const partners = new InMemoryPartnerRepository();
    await partners.create({ name: "pfa-preview", keyHash: "a".repeat(64) });

    const { partner, newSecret } = await setPartnerWebhook(partners, "pfa-preview", URL_);

    expect(newSecret).toMatch(/^whsec_/);
    expect(partner.webhookSecret).toBe(newSecret);
  });

  it("refuses an unusable address, an unknown partner and a revoked one, changing nothing", async () => {
    const partners = new InMemoryPartnerRepository();
    const created = await partners.create({ name: "pfa-preview", keyHash: "a".repeat(64) });
    const revoked = await partners.create({ name: "gone", keyHash: "b".repeat(64) });
    await partners.revoke(revoked.id);

    await expect(setPartnerWebhook(partners, "pfa-preview", "http://x.test")).rejects.toThrow(
      InvalidWebhookUrlError,
    );
    await expect(setPartnerWebhook(partners, "nobody", URL_)).rejects.toThrow(PartnerNotFoundError);
    await expect(setPartnerWebhook(partners, "gone", URL_)).rejects.toThrow(/revoked/);
    expect((await partners.getById(created.id))?.webhookUrl).toBeNull();
    expect((await partners.getById(revoked.id))?.webhookUrl).toBeNull();
  });
});

describe("rotateWebhookSecret", () => {
  it("replaces the secret with a new one, returned once, and keeps the address", async () => {
    const partners = new InMemoryPartnerRepository();
    await partners.create({
      name: "pfa-preview",
      keyHash: "a".repeat(64),
      webhookUrl: URL_,
      webhookSecret: "whsec_old",
    });

    const { partner, newSecret } = await rotateWebhookSecret(partners, "pfa-preview");

    expect(newSecret).toMatch(/^whsec_/);
    expect(newSecret).not.toBe("whsec_old");
    expect(partner).toMatchObject({ webhookSecret: newSecret, webhookUrl: URL_ });
  });

  it("gives a different secret each time", async () => {
    const partners = new InMemoryPartnerRepository();
    await partners.create({ name: "pfa-preview", keyHash: "a".repeat(64) });

    const first = await rotateWebhookSecret(partners, "pfa-preview");
    const second = await rotateWebhookSecret(partners, "pfa-preview");

    expect(second.newSecret).not.toBe(first.newSecret);
  });

  it("refuses an unknown partner and a revoked one, changing nothing", async () => {
    const partners = new InMemoryPartnerRepository();
    const revoked = await partners.create({
      name: "gone",
      keyHash: "b".repeat(64),
      webhookSecret: "whsec_keep",
    });
    await partners.revoke(revoked.id);

    await expect(rotateWebhookSecret(partners, "nobody")).rejects.toThrow(PartnerNotFoundError);
    await expect(rotateWebhookSecret(partners, "gone")).rejects.toThrow(/revoked/);
    expect((await partners.getById(revoked.id))?.webhookSecret).toBe("whsec_keep");
  });
});
