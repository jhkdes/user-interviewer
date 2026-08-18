import type { SupabaseClient } from "@supabase/supabase-js";
import { describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { runStudyRepositoryContractTests } from "../../contract-tests/study-repository.contract";
import { SupabaseStudyRepository } from "../supabase-study-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)("SupabaseStudyRepository (integration)", () => {
  let client: SupabaseClient;

  runStudyRepositoryContractTests(async () => {
    client ??= createServerSupabaseClient();
    // Studies cascade-delete their interviews/reports, so this alone resets
    // everything this contract test suite touches.
    await client.from("studies").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    return new SupabaseStudyRepository(client);
  });
});
