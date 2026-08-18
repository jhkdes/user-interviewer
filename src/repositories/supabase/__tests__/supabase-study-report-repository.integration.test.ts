import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { runStudyReportRepositoryContractTests } from "../../contract-tests/study-report-repository.contract";
import { SupabaseStudyReportRepository } from "../supabase-study-report-repository";
import { SupabaseStudyRepository } from "../supabase-study-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)("SupabaseStudyReportRepository (integration)", () => {
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
      linkToken: `study-report-repo-fixture-${Date.now()}`,
    });
    studyId = study.id;
  });

  runStudyReportRepositoryContractTests(
    async () => {
      await client.from("study_reports").delete().eq("study_id", studyId);
      return new SupabaseStudyReportRepository(client);
    },
    () => studyId,
  );
});
