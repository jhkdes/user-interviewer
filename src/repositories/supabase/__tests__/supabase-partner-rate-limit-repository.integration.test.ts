import type { SupabaseClient } from "@supabase/supabase-js";
import { describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { runPartnerRateLimitRepositoryContractTests } from "../../contract-tests/partner-rate-limit-repository.contract";
import { SupabasePartnerRateLimitRepository } from "../supabase-partner-rate-limit-repository";
import { SupabasePartnerRepository } from "../supabase-partner-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)("SupabasePartnerRateLimitRepository (integration)", () => {
  let client: SupabaseClient;

  runPartnerRateLimitRepositoryContractTests(async () => {
    client ??= createServerSupabaseClient();
    const partners = new SupabasePartnerRepository(client);
    const suffix = Math.random().toString(36).slice(2, 10);
    const a = await partners.create({ name: `rate-a-${suffix}`, keyHash: suffix.padEnd(64, "c") });
    const b = await partners.create({ name: `rate-b-${suffix}`, keyHash: suffix.padEnd(64, "d") });
    return {
      repo: new SupabasePartnerRateLimitRepository(client),
      partnerId: a.id,
      otherPartnerId: b.id,
    };
  });
});
