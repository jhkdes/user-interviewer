import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { runInterviewRepositoryContractTests } from "../../contract-tests/interview-repository.contract";
import { SupabaseInterviewRepository } from "../supabase-interview-repository";
import { SupabaseStudyRepository } from "../supabase-study-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)("SupabaseInterviewRepository (integration)", () => {
  let client: SupabaseClient;
  let studyId: string;

  beforeAll(async () => {
    client = createServerSupabaseClient();
    const study = await new SupabaseStudyRepository(client).create({
      targetProfile: {
        industry: "Fintech",
        yearsOfExperience: "5-10 years",
        jobTitle: "Product Manager",
        seniority: "Senior",
        responsibility: "Owns the payments roadmap",
      },
      linkToken: `interview-repo-fixture-${Date.now()}`,
    });
    studyId = study.id;
  });

  runInterviewRepositoryContractTests(
    async () => {
      await client.from("interviews").delete().eq("study_id", studyId);
      return new SupabaseInterviewRepository(client);
    },
    () => studyId,
  );
});
