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
      title: "How AI Actually Shows Up in a PM's Day",
      description: "how product managers really use AI at work",
      preInterviewQuestions: [],
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
