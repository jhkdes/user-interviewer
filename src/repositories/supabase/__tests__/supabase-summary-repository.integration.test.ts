import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { runSummaryRepositoryContractTests } from "../../contract-tests/summary-repository.contract";
import { SupabaseInterviewRepository } from "../supabase-interview-repository";
import { SupabaseStudyRepository } from "../supabase-study-repository";
import { SupabaseSummaryRepository } from "../supabase-summary-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)("SupabaseSummaryRepository (integration)", () => {
  let client: SupabaseClient;
  let interviewId: string;

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
      linkToken: `summary-repo-fixture-${Date.now()}`,
    });
    const interview = await new SupabaseInterviewRepository(client).create({
      studyId: study.id,
      firstName: "Fixture",
      email: "fixture@example.com",
      roleDescription: "role",
    });
    interviewId = interview.id;
  });

  runSummaryRepositoryContractTests(
    async () => {
      // summaries.interview_id is unique, so clear any prior summary for this fixture interview
      await client.from("summaries").delete().eq("interview_id", interviewId);
      return new SupabaseSummaryRepository(client);
    },
    () => interviewId,
  );
});
