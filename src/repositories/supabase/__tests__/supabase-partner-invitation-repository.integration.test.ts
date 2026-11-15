import type { SupabaseClient } from "@supabase/supabase-js";
import { describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { generateLinkToken } from "@/study-service/link-token";
import { runPartnerInvitationRepositoryContractTests } from "../../contract-tests/partner-invitation-repository.contract";
import { SupabasePartnerInvitationRepository } from "../supabase-partner-invitation-repository";
import { SupabaseStudyRepository } from "../supabase-study-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)("SupabasePartnerInvitationRepository (integration)", () => {
  let client: SupabaseClient;

  runPartnerInvitationRepositoryContractTests(async () => {
    client ??= createServerSupabaseClient();
    // Studies cascade-delete their invitations, so this resets everything this suite touches.
    await client.from("studies").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const studies = new SupabaseStudyRepository(client);
    return {
      invitations: new SupabasePartnerInvitationRepository(client),
      newStudyId: async () =>
        (
          await studies.create({
            type: "feedback",
            title: "T",
            description: "D",
            feedbackQuestions: ["Q"],
            preInterviewQuestions: [],
            linkToken: generateLinkToken(),
          })
        ).id,
    };
  });
});
