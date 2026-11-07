import { randomUUID } from "node:crypto";
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

export class InMemoryPartnerInvitationRepository implements PartnerInvitationRepository {
  private invitations = new Map<string, PartnerInvitation>();

  async create(input: CreateInvitationInput): Promise<PartnerInvitation> {
    if (await this.getByStudyAndTrackingId(input.studyId, input.trackingId)) {
      throw new Error("An invitation with this tracking id already exists in the study");
    }
    const now = new Date();
    const invitation: PartnerInvitation = {
      id: randomUUID(),
      studyId: input.studyId,
      trackingId: input.trackingId,
      colleagueFirstName: input.colleagueFirstName,
      context: { ...input.context },
      createdAt: now,
      updatedAt: now,
    };
    this.invitations.set(invitation.id, invitation);
    return this.copy(invitation);
  }

  async getById(id: string): Promise<PartnerInvitation | null> {
    const invitation = this.invitations.get(id);
    return invitation ? this.copy(invitation) : null;
  }

  async getByStudyAndTrackingId(
    studyId: string,
    trackingId: string,
  ): Promise<PartnerInvitation | null> {
    for (const invitation of this.invitations.values()) {
      if (invitation.studyId === studyId && invitation.trackingId === trackingId) {
        return this.copy(invitation);
      }
    }
    return null;
  }

  async update(
    id: string,
    patch: { colleagueFirstName?: string; context?: Record<string, string> },
  ): Promise<PartnerInvitation> {
    const invitation = this.invitations.get(id);
    if (!invitation) throw new Error(`Invitation not found: ${id}`);
    if (patch.colleagueFirstName !== undefined) {
      invitation.colleagueFirstName = patch.colleagueFirstName;
    }
    if (patch.context !== undefined) invitation.context = { ...patch.context };
    invitation.updatedAt = new Date();
    return this.copy(invitation);
  }

  async listByStudyId(
    studyId: string,
    options: { limit?: number; cursor?: string | null } = {},
  ): Promise<InvitationPage> {
    const limit = Math.min(
      Math.max(options.limit ?? DEFAULT_INVITATION_PAGE_SIZE, 1),
      MAX_INVITATION_PAGE_SIZE,
    );
    const after = options.cursor ? decodeInvitationCursor(options.cursor) : null;
    const all = [...this.invitations.values()]
      .filter((i) => i.studyId === studyId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .filter(
        (i) =>
          !after ||
          i.createdAt.toISOString() > after.createdAt ||
          (i.createdAt.toISOString() === after.createdAt && i.id > after.id),
      );
    const items = all.slice(0, limit).map((i) => this.copy(i));
    const hasMore = all.length > limit;
    return {
      items,
      nextCursor:
        hasMore && items.length > 0
          ? encodeInvitationCursor(
              items[items.length - 1].createdAt.toISOString(),
              items[items.length - 1].id,
            )
          : null,
    };
  }

  private copy(invitation: PartnerInvitation): PartnerInvitation {
    return { ...invitation, context: { ...invitation.context } };
  }
}
