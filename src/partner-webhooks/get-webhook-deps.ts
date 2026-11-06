import { fetchConversationAudioState } from "@/lib/elevenlabs/client";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getPartnerRepository } from "@/repositories/get-partner-repository";
import { getPartnerWebhookDeliveryRepository } from "@/repositories/get-partner-webhook-delivery-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import type { WebhookDeps } from "./deliver";

/** Wires the live dependencies for sending partner webhooks (server-only). */
export function getPartnerWebhookDeps(): WebhookDeps {
  return {
    deliveries: getPartnerWebhookDeliveryRepository(),
    partners: getPartnerRepository(),
    interviews: getInterviewRepository(),
    studies: getStudyRepository(),
    audioState: fetchConversationAudioState,
  };
}
