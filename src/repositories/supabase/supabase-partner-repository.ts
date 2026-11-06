import type { SupabaseClient } from "@supabase/supabase-js";
import type { Partner } from "@/domain";
import type { CreatePartnerInput, PartnerRepository } from "../partner-repository";

interface PartnerRow {
  id: string;
  name: string;
  key_hash: string;
  webhook_url: string | null;
  webhook_secret: string | null;
  created_at: string;
  revoked_at: string | null;
}

function toPartner(row: PartnerRow): Partner {
  return {
    id: row.id,
    name: row.name,
    keyHash: row.key_hash,
    webhookUrl: row.webhook_url,
    webhookSecret: row.webhook_secret,
    createdAt: new Date(row.created_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
}

export class SupabasePartnerRepository implements PartnerRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreatePartnerInput): Promise<Partner> {
    const { data, error } = await this.client
      .from("api_partners")
      .insert({
        name: input.name,
        key_hash: input.keyHash,
        webhook_url: input.webhookUrl ?? null,
        webhook_secret: input.webhookSecret ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create partner: ${error.message}`);
    return toPartner(data as PartnerRow);
  }

  private async findOne(
    column: "id" | "name" | "key_hash",
    value: string,
  ): Promise<Partner | null> {
    const { data, error } = await this.client
      .from("api_partners")
      .select()
      .eq(column, value)
      .maybeSingle();
    if (error) throw new Error(`Failed to read partner: ${error.message}`);
    return data ? toPartner(data as PartnerRow) : null;
  }

  getById(id: string) {
    return this.findOne("id", id);
  }
  getByName(name: string) {
    return this.findOne("name", name);
  }
  getByKeyHash(keyHash: string) {
    return this.findOne("key_hash", keyHash);
  }

  async list(): Promise<Partner[]> {
    const { data, error } = await this.client
      .from("api_partners")
      .select()
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Failed to list partners: ${error.message}`);
    return (data as PartnerRow[]).map(toPartner);
  }

  async revoke(id: string): Promise<Partner> {
    const existing = await this.getById(id);
    if (!existing) throw new Error(`Partner not found: ${id}`);
    if (existing.revokedAt) return existing;
    const { data, error } = await this.client
      .from("api_partners")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(`Failed to revoke partner: ${error.message}`);
    return toPartner(data as PartnerRow);
  }
}
