import type { SupabaseClient } from "@supabase/supabase-js";
import { describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { runPartnerRepositoryContractTests } from "../../contract-tests/partner-repository.contract";
import { SupabasePartnerRepository } from "../supabase-partner-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)("SupabasePartnerRepository (integration)", () => {
  let client: SupabaseClient;

  runPartnerRepositoryContractTests(async () => {
    client ??= createServerSupabaseClient();
    // Partner studies reference their partner, so clear those first.
    await client.from("studies").delete().not("partner_id", "is", null);
    await client.from("api_partners").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    return new SupabasePartnerRepository(client);
  });
});
