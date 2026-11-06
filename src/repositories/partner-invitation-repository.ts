import type { PartnerInvitation } from "@/domain";

export interface CreateInvitationInput {
  studyId: string;
  trackingId: string;
  colleagueFirstName: string;
  context: Record<string, string>;
}

export interface InvitationPage {
  items: PartnerInvitation[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
}

export interface PartnerInvitationRepository {
  /** Rejects a tracking id that already exists in the study. */
  create(input: CreateInvitationInput): Promise<PartnerInvitation>;
  getById(id: string): Promise<PartnerInvitation | null>;
  getByStudyAndTrackingId(studyId: string, trackingId: string): Promise<PartnerInvitation | null>;
  /** Changes the colleague's name and/or context and moves `updatedAt`. */
  update(
    id: string,
    patch: { colleagueFirstName?: string; context?: Record<string, string> },
  ): Promise<PartnerInvitation>;
  /** A study's invitations, oldest first, `limit` at a time. */
  listByStudyId(
    studyId: string,
    options?: { limit?: number; cursor?: string | null },
  ): Promise<InvitationPage>;
}

/** An opaque position in the oldest-first listing: the last item's time and id. */
export function encodeInvitationCursor(item: PartnerInvitation): string {
  return Buffer.from(`${item.createdAt.toISOString()}|${item.id}`, "utf8").toString("base64url");
}

export function decodeInvitationCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id, extra] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!createdAt || !id || extra !== undefined || Number.isNaN(Date.parse(createdAt))) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}

export const DEFAULT_INVITATION_PAGE_SIZE = 50;
export const MAX_INVITATION_PAGE_SIZE = 200;
