import type { SupabaseClient } from "@supabase/supabase-js";
import { describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { runPartnerIdempotencyRepositoryContractTests } from "../../contract-tests/partner-idempotency-repository.contract";
import { SupabasePartnerIdempotencyRepository } from "../supabase-partner-idempotency-repository";
import { SupabasePartnerRepository } from "../supabase-partner-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)("SupabasePartnerIdempotencyRepository (integration)", () => {
  let client: SupabaseClient;

  runPartnerIdempotencyRepositoryContractTests(async () => {
    client ??= createServerSupabaseClient();
    await client.from("partner_idempotency_keys").delete().neq("idempotency_key", "");
    const partners = new SupabasePartnerRepository(client);
    const suffix = Math.random().toString(36).slice(2, 10);
    const a = await partners.create({ name: `idem-a-${suffix}`, keyHash: suffix.padEnd(64, "a") });
    const b = await partners.create({ name: `idem-b-${suffix}`, keyHash: suffix.padEnd(64, "b") });
    return {
      repo: new SupabasePartnerIdempotencyRepository(client),
      partnerId: a.id,
      otherPartnerId: b.id,
    };
  });
});
