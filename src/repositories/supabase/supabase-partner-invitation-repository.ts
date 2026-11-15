import type { SupabaseClient } from "@supabase/supabase-js";
import type { PartnerInvitation } from "@/domain";
import {
  DEFAULT_INVITATION_PAGE_SIZE,
  MAX_INVITATION_PAGE_SIZE,
  decodeInvitationCursor,
  encodeInvitationCursor,
  type CreateInvitationInput,
  type InvitationPage,
  type PartnerInvitationRepository,
} from "../partner-invitation-repository";

interface InvitationRow {
  id: string;
  study_id: string;
  tracking_id: string;
  colleague_first_name: string;
  context: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

function toInvitation(row: InvitationRow): PartnerInvitation {
  return {
    id: row.id,
    studyId: row.study_id,
    trackingId: row.tracking_id,
    colleagueFirstName: row.colleague_first_name,
    context: row.context ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export class SupabasePartnerInvitationRepository implements PartnerInvitationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateInvitationInput): Promise<PartnerInvitation> {
    const { data, error } = await this.client
      .from("partner_invitations")
      .insert({
        study_id: input.studyId,
        tracking_id: input.trackingId,
        colleague_first_name: input.colleagueFirstName,
        context: input.context,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to create invitation: ${error.message}`);
    return toInvitation(data as InvitationRow);
  }

  async getById(id: string): Promise<PartnerInvitation | null> {
    const { data, error } = await this.client
      .from("partner_invitations")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`Failed to read invitation: ${error.message}`);
    return data ? toInvitation(data as InvitationRow) : null;
  }

  async getByStudyAndTrackingId(
    studyId: string,
    trackingId: string,
  ): Promise<PartnerInvitation | null> {
    const { data, error } = await this.client
      .from("partner_invitations")
      .select()
      .eq("study_id", studyId)
      .eq("tracking_id", trackingId)
      .maybeSingle();
    if (error) throw new Error(`Failed to read invitation: ${error.message}`);
    return data ? toInvitation(data as InvitationRow) : null;
  }

  async update(
    id: string,
    patch: { colleagueFirstName?: string; context?: Record<string, string> },
  ): Promise<PartnerInvitation> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.colleagueFirstName !== undefined) row.colleague_first_name = patch.colleagueFirstName;
    if (patch.context !== undefined) row.context = patch.context;
    const { data, error } = await this.client
      .from("partner_invitations")
      .update(row)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) throw new Error(`Failed to update invitation: ${error.message}`);
    if (!data) throw new Error(`Invitation not found: ${id}`);
    return toInvitation(data as InvitationRow);
  }

  async listByStudyId(
    studyId: string,
    options: { limit?: number; cursor?: string | null } = {},
  ): Promise<InvitationPage> {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_INVITATION_PAGE_SIZE, 1),
      MAX_INVITATION_PAGE_SIZE,
    );
    let query = this.client
      .from("partner_invitations")
      .select()
      .eq("study_id", studyId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limit + 1);

    const after = options.cursor ? decodeInvitationCursor(options.cursor) : null;
    if (after) {
      query = query.or(
        `created_at.gt.${after.createdAt},and(created_at.eq.${after.createdAt},id.gt.${after.id})`,
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list invitations: ${error.message}`);
    const rows = data as InvitationRow[];
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toInvitation),
      // From the row's own timestamp text, which keeps the microseconds a Date would lose.
      nextCursor:
        rows.length > limit && last
          ? encodeInvitationCursor(last.created_at.replace(/\+00:00$/, "Z"), last.id)
          : null,
    };
  }
}
