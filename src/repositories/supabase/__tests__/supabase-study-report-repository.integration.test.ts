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
      title: "How AI Actually Shows Up in a PM's Day",
      description: "how product managers really use AI at work",
      preInterviewQuestions: [],
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
