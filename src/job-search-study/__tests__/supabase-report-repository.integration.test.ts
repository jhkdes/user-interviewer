import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { hasSupabaseTestEnv } from "@/repositories/supabase/__tests__/test-env";
import { SupabaseInterviewRepository } from "@/repositories/supabase/supabase-interview-repository";
import { SupabaseStudyRepository } from "@/repositories/supabase/supabase-study-repository";
import { SupabaseJobSearchReportRepository } from "../storage/supabase-report-repository";
import { runJobSearchReportRepositoryContractTests } from "./report-repository.contract";

// Needs a Supabase project that has migration 0021_add_job_search_reports.sql applied. Skips without credentials.
describe.skipIf(!hasSupabaseTestEnv)("SupabaseJobSearchReportRepository (integration)", () => {
  let client: SupabaseClient;
  let studyId: string;
  const studyIds: string[] = [];

  beforeAll(async () => {
    client = createServerSupabaseClient();
  });

  afterAll(async () => {
    // Deleting a study cascades to its interviews and reports.
    for (const id of studyIds) await new SupabaseStudyRepository(client).delete(id);
  });

  runJobSearchReportRepositoryContractTests(
    async () => {
      const study = await new SupabaseStudyRepository(client).create({
        title: "Job search report repository fixture",
        description: "fixture",
        preInterviewQuestions: [],
        linkToken: `job-search-report-fixture-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        reportPipeline: "job-search",
      });
      studyId = study.id;
      studyIds.push(study.id);
      return new SupabaseJobSearchReportRepository(client);
    },
    async () => {
      const interview = await new SupabaseInterviewRepository(client).create({
        studyId,
        firstName: "Fixture",
        email: "fixture@example.com",
      });
      return { interviewId: interview.id, studyId };
    },
  );
});
