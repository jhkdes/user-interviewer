import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { runInterviewMessageRepositoryContractTests } from "../../contract-tests/interview-message-repository.contract";
import { SupabaseInterviewMessageRepository } from "../supabase-interview-message-repository";
import { SupabaseInterviewRepository } from "../supabase-interview-repository";
import { SupabaseStudyRepository } from "../supabase-study-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)("SupabaseInterviewMessageRepository (integration)", () => {
  let client: SupabaseClient;
  let studyId: string;

  beforeAll(async () => {
    client = createServerSupabaseClient();
    const study = await new SupabaseStudyRepository(client).create({
      title: "Interview message repo fixture",
      description: "a fixture study for interview message repository tests",
      preInterviewQuestions: [],
      linkToken: `interview-message-repo-fixture-${Date.now()}`,
    });
    studyId = study.id;
  });

  runInterviewMessageRepositoryContractTests(
    async () => {
      // Deleting the interviews cascades to their messages.
      await client.from("interviews").delete().eq("study_id", studyId);
      return {
        interviewRepo: new SupabaseInterviewRepository(client),
        messageRepo: new SupabaseInterviewMessageRepository(client),
      };
    },
    () => studyId,
  );
});
