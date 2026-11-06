import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { generateLinkToken } from "@/study-service/link-token";
import { runPartnerWebhookDeliveryRepositoryContractTests } from "../../contract-tests/partner-webhook-delivery-repository.contract";
import { SupabaseInterviewRepository } from "../supabase-interview-repository";
import { SupabasePartnerRepository } from "../supabase-partner-repository";
import { SupabasePartnerWebhookDeliveryRepository } from "../supabase-partner-webhook-delivery-repository";
import { SupabaseStudyRepository } from "../supabase-study-repository";
import { hasSupabaseTestEnv } from "./test-env";

describe.skipIf(!hasSupabaseTestEnv)(
  "SupabasePartnerWebhookDeliveryRepository (integration)",
  () => {
    let client: SupabaseClient;

    runPartnerWebhookDeliveryRepositoryContractTests(async () => {
      client ??= createServerSupabaseClient();
      // Studies cascade-delete their interviews and deliveries; then partners can go.
      await client.from("studies").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await client.from("api_partners").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      const partners = new SupabasePartnerRepository(client);
      const studies = new SupabaseStudyRepository(client);
      const interviews = new SupabaseInterviewRepository(client);
      return {
        deliveries: new SupabasePartnerWebhookDeliveryRepository(client),
        newTarget: async () => {
          const partner = await partners.create({
            name: `p-${randomBytes(4).toString("hex")}`,
            keyHash: randomBytes(32).toString("hex"),
          });
          const study = await studies.create({
            type: "feedback",
            title: "T",
            description: "D",
            feedbackQuestions: ["Q"],
            preInterviewQuestions: [],
            linkToken: generateLinkToken(),
            partnerId: partner.id,
            ownerRef: randomBytes(4).toString("hex"),
          });
          const interview = await interviews.create({
            studyId: study.id,
            firstName: "A",
            email: "a@example.com",
          });
          return { partnerId: partner.id, studyId: study.id, interviewId: interview.id };
        },
      };
    });
  },
);
