import { createServerSupabaseClient } from "@/lib/supabase/client";
import { SupabasePartnerWebhookDeliveryRepository } from "./supabase/supabase-partner-webhook-delivery-repository";
import type { PartnerWebhookDeliveryRepository } from "./partner-webhook-delivery-repository";

/** Resolves the live PartnerWebhookDeliveryRepository (server-only). */
export function getPartnerWebhookDeliveryRepository(): PartnerWebhookDeliveryRepository {
  return new SupabasePartnerWebhookDeliveryRepository(createServerSupabaseClient());
}
