import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartnerWebhookDelivery, WebhookDeliveryStatus } from "@/domain";
import type {
  DeliveryResultPatch,
  EnqueueDeliveryInput,
  PartnerWebhookDeliveryRepository,
} from "../partner-webhook-delivery-repository";

interface DeliveryRow {
  id: string;
  partner_id: string;
  study_id: string;
  interview_id: string;
  event: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  next_attempt_at: string;
  last_attempt_at: string | null;
  last_status_code: number | null;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
  expires_at: string;
}

function toDelivery(row: DeliveryRow): PartnerWebhookDelivery {
  return {
    id: row.id,
    partnerId: row.partner_id,
    studyId: row.study_id,
    interviewId: row.interview_id,
    event: row.event,
    payload: row.payload,
    status: row.status as WebhookDeliveryStatus,
    attempts: row.attempts,
    nextAttemptAt: new Date(row.next_attempt_at),
    lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
    lastStatusCode: row.last_status_code,
    lastError: row.last_error,
    createdAt: new Date(row.created_at),
    deliveredAt: row.delivered_at ? new Date(row.delivered_at) : null,
    expiresAt: new Date(row.expires_at),
  };
}

export class SupabasePartnerWebhookDeliveryRepository implements PartnerWebhookDeliveryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async enqueue(input: EnqueueDeliveryInput) {
    const { data, error } = await this.client
      .from("partner_webhook_deliveries")
      .insert({
        partner_id: input.partnerId,
        study_id: input.studyId,
        interview_id: input.interviewId,
        event: input.event,
        payload: input.payload,
        next_attempt_at: input.nextAttemptAt.toISOString(),
        expires_at: input.expiresAt.toISOString(),
      })
      .select()
      .single();
    if (!error) return { delivery: toDelivery(data as DeliveryRow), created: true };

    // The unique (interview, event) index: the event was already queued.
    const existing = await this.getByInterview(input.interviewId, input.event);
    if (existing) return { delivery: existing, created: false };
    throw new Error(`Failed to queue webhook delivery: ${error.message}`);
  }

  async getById(id: string) {
    const { data, error } = await this.client
      .from("partner_webhook_deliveries")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Failed to read webhook delivery: ${error.message}`);
    return data ? toDelivery(data as DeliveryRow) : null;
  }

  async getByInterview(interviewId: string, event: string) {
    const { data, error } = await this.client
      .from("partner_webhook_deliveries")
      .select()
      .eq("interview_id", interviewId)
      .eq("event", event)
      .maybeSingle();
    if (error) throw new Error(`Failed to read webhook delivery: ${error.message}`);
    return data ? toDelivery(data as DeliveryRow) : null;
  }

  async listDue(now: Date, limit: number) {
    const { data, error } = await this.client
      .from("partner_webhook_deliveries")
      .select()
      .eq("status", "pending")
      .lte("next_attempt_at", now.toISOString())
      .order("next_attempt_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`Failed to list due webhook deliveries: ${error.message}`);
    return (data as DeliveryRow[]).map(toDelivery);
  }

  async claim(id: string, now: Date, leaseUntil: Date) {
    // One conditional update: only a row that is still pending and due is taken.
    const { data, error } = await this.client
      .from("partner_webhook_deliveries")
      .update({ next_attempt_at: leaseUntil.toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .lte("next_attempt_at", now.toISOString())
      .select();
    if (error) throw new Error(`Failed to claim webhook delivery: ${error.message}`);
    const rows = data as DeliveryRow[];
    return rows.length > 0 ? toDelivery(rows[0]) : null;
  }

  async recordResult(id: string, patch: DeliveryResultPatch) {
    const { data, error } = await this.client
      .from("partner_webhook_deliveries")
      .update({
        status: patch.status,
        attempts: patch.attempts,
        next_attempt_at: patch.nextAttemptAt.toISOString(),
        last_attempt_at: patch.lastAttemptAt ? patch.lastAttemptAt.toISOString() : null,
        last_status_code: patch.lastStatusCode,
        last_error: patch.lastError,
        delivered_at: patch.deliveredAt ? patch.deliveredAt.toISOString() : null,
      })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Failed to record webhook result: ${error.message}`);
    if (!data) throw new Error(`Delivery not found: ${id}`);
    return toDelivery(data as DeliveryRow);
  }

  async reschedule(id: string, nextAttemptAt: Date, reason: string | null) {
    const { data, error } = await this.client
      .from("partner_webhook_deliveries")
      .update({ next_attempt_at: nextAttemptAt.toISOString(), last_error: reason })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Failed to reschedule webhook delivery: ${error.message}`);
    if (!data) throw new Error(`Delivery not found: ${id}`);
    return toDelivery(data as DeliveryRow);
  }
}
