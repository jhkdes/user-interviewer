import { describe, expect, it } from "vitest";
import type { PartnerInvitationRepository } from "../partner-invitation-repository";
import { NONEXISTENT_ID } from "./nonexistent-id";

export interface InvitationContractHarness {
  invitations: PartnerInvitationRepository;
  /** Makes a study to attach invitations to (a real row for Supabase, which has a foreign key). */
  newStudyId: () => Promise<string>;
}

/** Shared behavioral contract for any PartnerInvitationRepository implementation. */
export function runPartnerInvitationRepositoryContractTests(
  makeHarness: () => InvitationContractHarness | Promise<InvitationContractHarness>,
) {
  describe("PartnerInvitationRepository contract", () => {
    it("creates an invitation and finds it by id and by study and tracking id", async () => {
      const { invitations, newStudyId } = await makeHarness();
      const studyId = await newStudyId();

      const created = await invitations.create({
        studyId,
        trackingId: "t".repeat(22),
        colleagueFirstName: "Priya",
        context: { workContext: "We shipped the billing migration." },
      });

      expect(created).toMatchObject({
        studyId,
        trackingId: "t".repeat(22),
        colleagueFirstName: "Priya",
        context: { workContext: "We shipped the billing migration." },
      });
      expect(created.createdAt).toBeInstanceOf(Date);
      expect((await invitations.getById(created.id))?.id).toBe(created.id);
      expect((await invitations.getByStudyAndTrackingId(studyId, "t".repeat(22)))?.id).toBe(
        created.id,
      );
    });

    it("keeps an empty context as an empty object", async () => {
      const { invitations, newStudyId } = await makeHarness();

      const created = await invitations.create({
        studyId: await newStudyId(),
        trackingId: "a".repeat(22),
        colleagueFirstName: "Sam",
        context: {},
      });

      expect(created.context).toEqual({});
    });

    it("returns null for an unknown id, or a tracking id from a different study", async () => {
      const { invitations, newStudyId } = await makeHarness();
      const studyA = await newStudyId();
      const studyB = await newStudyId();
      await invitations.create({
        studyId: studyA,
        trackingId: "x".repeat(22),
        colleagueFirstName: "A",
        context: {},
      });

      expect(await invitations.getById(NONEXISTENT_ID)).toBeNull();
      expect(await invitations.getByStudyAndTrackingId(studyB, "x".repeat(22))).toBeNull();
      expect(await invitations.getByStudyAndTrackingId(studyA, "nope")).toBeNull();
    });

    it("refuses a repeated tracking id within a study, but allows the same one in another study", async () => {
      const { invitations, newStudyId } = await makeHarness();
      const studyA = await newStudyId();
      const studyB = await newStudyId();
      const input = { trackingId: "d".repeat(22), colleagueFirstName: "D", context: {} };
      await invitations.create({ studyId: studyA, ...input });

      await expect(invitations.create({ studyId: studyA, ...input })).rejects.toThrow();
      await expect(invitations.create({ studyId: studyB, ...input })).resolves.toBeDefined();
    });

    it("updates the name and context and moves updatedAt, leaving the tracking id alone", async () => {
      const { invitations, newStudyId } = await makeHarness();
      const created = await invitations.create({
        studyId: await newStudyId(),
        trackingId: "u".repeat(22),
        colleagueFirstName: "Old",
        context: { workContext: "old" },
      });
      await new Promise((resolve) => setTimeout(resolve, 5));

      const updated = await invitations.update(created.id, {
        colleagueFirstName: "New",
        context: { workContext: "new", team: "billing" },
      });

      expect(updated).toMatchObject({
        trackingId: "u".repeat(22),
        colleagueFirstName: "New",
        context: { workContext: "new", team: "billing" },
      });
      expect(updated.updatedAt.getTime()).toBeGreaterThan(created.updatedAt.getTime());
      expect(updated.createdAt.getTime()).toBe(created.createdAt.getTime());
    });

    it("rejects updating an unknown invitation", async () => {
      const { invitations } = await makeHarness();

      await expect(
        invitations.update(NONEXISTENT_ID, { colleagueFirstName: "x" }),
      ).rejects.toThrow();
    });

    it("lists a study's invitations oldest first, and only that study's", async () => {
      const { invitations, newStudyId } = await makeHarness();
      const studyId = await newStudyId();
      const other = await newStudyId();
      const ids: string[] = [];
      for (const name of ["one", "two", "three"]) {
        const i = await invitations.create({
          studyId,
          trackingId: `${name}${"_".repeat(22)}`,
          colleagueFirstName: name,
          context: {},
        });
        ids.push(i.id);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      await invitations.create({
        studyId: other,
        trackingId: "z".repeat(22),
        colleagueFirstName: "z",
        context: {},
      });

      const page = await invitations.listByStudyId(studyId);

      expect(page.items.map((i) => i.id)).toEqual(ids);
      expect(page.nextCursor).toBeNull();
    });

    it("pages through invitations with a cursor, without repeats or gaps", async () => {
      const { invitations, newStudyId } = await makeHarness();
      const studyId = await newStudyId();
      const ids: string[] = [];
      for (let n = 0; n < 5; n++) {
        const i = await invitations.create({
          studyId,
          trackingId: `p${n}${"-".repeat(22)}`,
          colleagueFirstName: `p${n}`,
          context: {},
        });
        ids.push(i.id);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await invitations.listByStudyId(studyId, { limit: 2, cursor });
        seen.push(...page.items.map((i) => i.id));
        cursor = page.nextCursor;
        pages++;
      } while (cursor && pages < 10);

      expect(seen).toEqual(ids);
      expect(pages).toBe(3);
    });
  });
}
