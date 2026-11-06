import { randomUUID } from "node:crypto";
import type { Partner } from "@/domain";
import type { CreatePartnerInput, PartnerRepository } from "../partner-repository";

export class InMemoryPartnerRepository implements PartnerRepository {
  private partners = new Map<string, Partner>();

  async create(input: CreatePartnerInput): Promise<Partner> {
    for (const existing of this.partners.values()) {
      if (existing.name === input.name)
        throw new Error(`Partner name already taken: ${input.name}`);
      if (existing.keyHash === input.keyHash) throw new Error("Partner key hash already in use");
    }
    const partner: Partner = {
      id: randomUUID(),
      name: input.name,
      keyHash: input.keyHash,
      webhookUrl: input.webhookUrl ?? null,
      webhookSecret: input.webhookSecret ?? null,
      createdAt: new Date(),
      revokedAt: null,
    };
    this.partners.set(partner.id, partner);
    return { ...partner };
  }

  async getById(id: string): Promise<Partner | null> {
    const partner = this.partners.get(id);
    return partner ? { ...partner } : null;
  }

  async getByName(name: string): Promise<Partner | null> {
    for (const partner of this.partners.values()) {
      if (partner.name === name) return { ...partner };
    }
    return null;
  }

  async getByKeyHash(keyHash: string): Promise<Partner | null> {
    for (const partner of this.partners.values()) {
      if (partner.keyHash === keyHash) return { ...partner };
    }
    return null;
  }

  async list(): Promise<Partner[]> {
    return [...this.partners.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((partner) => ({ ...partner }));
  }

  async revoke(id: string): Promise<Partner> {
    const partner = this.partners.get(id);
    if (!partner) throw new Error(`Partner not found: ${id}`);
    if (!partner.revokedAt) partner.revokedAt = new Date();
    return { ...partner };
  }
}
