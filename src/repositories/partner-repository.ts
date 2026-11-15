import type { Partner } from "@/domain";

export interface CreatePartnerInput {
  name: string;
  /** SHA-256 (hex) of the API key; the key itself is never stored. */
  keyHash: string;
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface PartnerRepository {
  /** Rejects a name or key hash that is already taken. */
  create(input: CreatePartnerInput): Promise<Partner>;
  getById(id: string): Promise<Partner | null>;
  getByName(name: string): Promise<Partner | null>;
  /** Finds a partner by key hash, revoked or not; the caller decides what a revoked one may do. */
  getByKeyHash(keyHash: string): Promise<Partner | null>;
  list(): Promise<Partner[]>;
  /** Sets a partner's webhook address and/or signing secret; a field left out is not changed. */
  updateWebhook(
    id: string,
    patch: { webhookUrl?: string; webhookSecret?: string },
  ): Promise<Partner>;
  /** Marks the partner revoked now. Revoking twice keeps the first time. */
  revoke(id: string): Promise<Partner>;
}
