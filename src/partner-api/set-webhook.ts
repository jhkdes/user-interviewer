import type { Partner } from "@/domain";
import type { PartnerRepository } from "@/repositories/partner-repository";
import { generateWebhookSecret } from "./api-key";

/** Why a webhook address is unusable, or null when it is fine. */
export function webhookUrlProblem(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "The webhook URL is not a valid address.";
  }
  if (url.protocol !== "https:") return "The webhook URL must start with https://";
  if (url.username || url.password) {
    return "The webhook URL must not contain a username or password; the signature identifies UI.";
  }
  return null;
}

export class PartnerNotFoundError extends Error {
  constructor(name: string) {
    super(`No partner named "${name}".`);
    this.name = "PartnerNotFoundError";
  }
}

export class InvalidWebhookUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWebhookUrlError";
  }
}

/**
 * Points a partner's webhook at an address. The signing secret is kept as it is;
 * only a partner that has none gets a new one, returned once so the operator can
 * pass it on. A revoked partner is refused, because it would never be sent to.
 */
export async function setPartnerWebhook(
  partners: PartnerRepository,
  name: string,
  webhookUrl: string,
): Promise<{ partner: Partner; newSecret: string | null }> {
  const problem = webhookUrlProblem(webhookUrl);
  if (problem) throw new InvalidWebhookUrlError(problem);

  const existing = await partners.getByName(name);
  if (!existing) throw new PartnerNotFoundError(name);
  if (existing.revokedAt) {
    throw new InvalidWebhookUrlError(
      `Partner "${name}" is revoked; its webhook would never be used.`,
    );
  }

  const newSecret = existing.webhookSecret ? null : generateWebhookSecret();
  const partner = await partners.updateWebhook(existing.id, {
    webhookUrl,
    ...(newSecret ? { webhookSecret: newSecret } : {}),
  });
  return { partner, newSecret };
}

/**
 * Replaces a partner's webhook signing secret with a new one, returned once.
 * From that moment events are signed with the new secret only, so the receiver
 * should accept both until it has switched; events that fail meanwhile are
 * retried for 24 hours.
 */
export async function rotateWebhookSecret(
  partners: PartnerRepository,
  name: string,
): Promise<{ partner: Partner; newSecret: string }> {
  const existing = await partners.getByName(name);
  if (!existing) throw new PartnerNotFoundError(name);
  if (existing.revokedAt) {
    throw new InvalidWebhookUrlError(`Partner "${name}" is revoked; its webhook is not used.`);
  }
  const newSecret = generateWebhookSecret();
  const partner = await partners.updateWebhook(existing.id, { webhookSecret: newSecret });
  return { partner, newSecret };
}
