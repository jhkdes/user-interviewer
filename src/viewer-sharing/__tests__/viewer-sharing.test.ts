import { beforeEach, describe, expect, it } from "vitest";
import { FakeEmailClient } from "@/lib/email";
import type { PmRole } from "@/pm-auth";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import {
  AlreadyAdminError,
  InvalidEmailError,
  InviteAlreadyAcceptedError,
  InviteEmailError,
  NotAViewerError,
  ViewerStudyNotFoundError,
  inviteViewer,
  listStudyViewers,
  removeViewerAccount,
  resendInvite,
  revokeViewerFromStudy,
  type ViewerAccount,
  type ViewerAuthAdmin,
  type ViewerGrantStore,
  type ViewerSharingDeps,
} from "..";

class FakeAuth implements ViewerAuthAdmin {
  accounts = new Map<string, ViewerAccount>();
  deleted: string[] = [];
  private n = 0;

  add(email: string, accepted: boolean): ViewerAccount {
    const account = { id: `user-${++this.n}`, email, accepted };
    this.accounts.set(account.id, account);
    return account;
  }
  async findByEmail(email: string) {
    return [...this.accounts.values()].find((a) => a.email === email) ?? null;
  }
  async getByIds(ids: string[]) {
    return ids.flatMap((id) => (this.accounts.has(id) ? [this.accounts.get(id)!] : []));
  }
  async createInvite(email: string) {
    const account = (await this.findByEmail(email)) ?? this.add(email, false);
    return { account, tokenHash: `token-for-${account.id}` };
  }
  async deleteUser(userId: string) {
    this.accounts.delete(userId);
    this.deleted.push(userId);
  }
}

class FakeStore implements ViewerGrantStore {
  roles = new Map<string, PmRole>();
  grants = new Set<string>(); // "userId|studyId"
  async getRole(userId: string) {
    return this.roles.get(userId) ?? null;
  }
  async listGrantedStudyIds(userId: string) {
    return [...this.grants].filter((g) => g.startsWith(`${userId}|`)).map((g) => g.split("|")[1]);
  }
  async ensureViewerRole(userId: string) {
    if (!this.roles.has(userId)) this.roles.set(userId, "viewer");
  }
  async addGrants(userId: string, studyIds: string[]) {
    for (const id of studyIds) this.grants.add(`${userId}|${id}`);
  }
  async removeGrant(userId: string, studyId: string) {
    this.grants.delete(`${userId}|${studyId}`);
  }
  async listGrantedUserIds(studyId: string) {
    return [...this.grants].filter((g) => g.endsWith(`|${studyId}`)).map((g) => g.split("|")[0]);
  }
}

describe("viewer sharing", () => {
  let auth: FakeAuth;
  let store: FakeStore;
  let email: FakeEmailClient;
  let deps: ViewerSharingDeps;
  let studyA: string;
  let studyB: string;
  const origin = "https://app.example.com";

  beforeEach(async () => {
    auth = new FakeAuth();
    store = new FakeStore();
    email = new FakeEmailClient();
    const studyRepo = new InMemoryStudyRepository();
    deps = { auth, store, studyRepo, emailClient: email };
    const make = (title: string, linkToken: string) =>
      studyRepo.create({ title, description: "d", preInterviewQuestions: [], linkToken });
    studyA = (await make("Study <A>", "tok-a")).id;
    studyB = (await make("Study B", "tok-b")).id;
  });

  describe("inviteViewer", () => {
    it("creates an account, gives it the viewer role and the grant, and emails the invite", async () => {
      const result = await inviteViewer(deps, {
        email: "  PM@Example.com ",
        studyIds: [studyA],
        origin,
      });

      expect(result).toMatchObject({ email: "pm@example.com", outcome: "invited" });
      expect(store.roles.get(result.userId)).toBe("viewer");
      expect(await store.listGrantedStudyIds(result.userId)).toEqual([studyA]);

      expect(email.sent).toHaveLength(1);
      expect(email.sent[0].to).toBe("pm@example.com");
      expect(email.sent[0].html).toContain(
        `${origin}/accept-invite?token_hash=token-for-${result.userId}`,
      );
    });

    it("names the study in the email, escaped", async () => {
      await inviteViewer(deps, { email: "pm@example.com", studyIds: [studyA], origin });
      expect(email.sent[0].html).toContain("Study &lt;A&gt;");
      expect(email.sent[0].html).not.toContain("Study <A>");
    });

    it("never puts a participant link or study id in the email", async () => {
      await inviteViewer(deps, { email: "pm@example.com", studyIds: [studyA], origin });
      expect(email.sent[0].html).not.toContain("tok-a");
      expect(email.sent[0].html).not.toContain(studyA);
    });

    it("rejects an invalid email without creating anything", async () => {
      await expect(
        inviteViewer(deps, { email: "not-an-email", studyIds: [studyA], origin }),
      ).rejects.toBeInstanceOf(InvalidEmailError);
      expect(auth.accounts.size).toBe(0);
    });

    it("rejects an unknown study without creating anything", async () => {
      await expect(
        inviteViewer(deps, { email: "pm@example.com", studyIds: ["missing"], origin }),
      ).rejects.toBeInstanceOf(ViewerStudyNotFoundError);
      expect(auth.accounts.size).toBe(0);
      expect(email.sent).toHaveLength(0);
    });

    it("refuses to touch an admin", async () => {
      const admin = auth.add("boss@example.com", true);
      store.roles.set(admin.id, "admin");

      await expect(
        inviteViewer(deps, { email: "boss@example.com", studyIds: [studyA], origin }),
      ).rejects.toBeInstanceOf(AlreadyAdminError);
      expect(store.roles.get(admin.id)).toBe("admin");
      expect(await store.listGrantedStudyIds(admin.id)).toEqual([]);
      expect(email.sent).toHaveLength(0);
    });

    it("adds a study for an active viewer without emailing", async () => {
      const first = await inviteViewer(deps, {
        email: "pm@example.com",
        studyIds: [studyA],
        origin,
      });
      auth.accounts.get(first.userId)!.accepted = true;
      email.sent.length = 0;

      const second = await inviteViewer(deps, {
        email: "pm@example.com",
        studyIds: [studyB],
        origin,
      });

      expect(second).toMatchObject({ userId: first.userId, outcome: "access-added" });
      expect((await store.listGrantedStudyIds(first.userId)).sort()).toEqual(
        [studyA, studyB].sort(),
      );
      expect(email.sent).toHaveLength(0);
    });

    it("sends a fresh invite to someone who has not accepted yet, listing all their studies", async () => {
      const first = await inviteViewer(deps, {
        email: "pm@example.com",
        studyIds: [studyA],
        origin,
      });
      email.sent.length = 0;

      const second = await inviteViewer(deps, {
        email: "pm@example.com",
        studyIds: [studyB],
        origin,
      });

      expect(second).toMatchObject({ userId: first.userId, outcome: "invite-resent" });
      expect(email.sent).toHaveLength(1);
      expect(email.sent[0].html).toContain("Study &lt;A&gt;");
      expect(email.sent[0].html).toContain("Study B");
    });

    it("gives an existing account that has no role the viewer role", async () => {
      const account = auth.add("plain@example.com", true);
      await inviteViewer(deps, { email: "plain@example.com", studyIds: [studyA], origin });
      expect(store.roles.get(account.id)).toBe("viewer");
    });

    it("keeps the grant when the email fails, and says so", async () => {
      email.scriptFailure(new Error("resend down"));

      await expect(
        inviteViewer(deps, { email: "pm@example.com", studyIds: [studyA], origin }),
      ).rejects.toBeInstanceOf(InviteEmailError);

      const account = await auth.findByEmail("pm@example.com");
      expect(await store.listGrantedStudyIds(account!.id)).toEqual([studyA]);
    });
  });

  describe("listStudyViewers", () => {
    it("lists who has the study, invited or active, by email", async () => {
      const a = await inviteViewer(deps, { email: "b@example.com", studyIds: [studyA], origin });
      await inviteViewer(deps, { email: "a@example.com", studyIds: [studyA], origin });
      await inviteViewer(deps, { email: "other@example.com", studyIds: [studyB], origin });
      auth.accounts.get(a.userId)!.accepted = true;

      expect(await listStudyViewers(deps, studyA)).toEqual([
        { userId: expect.any(String), email: "a@example.com", status: "invited" },
        { userId: a.userId, email: "b@example.com", status: "active" },
      ]);
    });

    it("is empty when no one has access", async () => {
      expect(await listStudyViewers(deps, studyA)).toEqual([]);
    });
  });

  describe("revokeViewerFromStudy", () => {
    it("removes only that study", async () => {
      const { userId } = await inviteViewer(deps, {
        email: "pm@example.com",
        studyIds: [studyA, studyB],
        origin,
      });

      await revokeViewerFromStudy(deps, userId, studyA);

      expect(await store.listGrantedStudyIds(userId)).toEqual([studyB]);
      expect(auth.deleted).toEqual([]);
    });

    it("refuses an admin", async () => {
      const admin = auth.add("boss@example.com", true);
      store.roles.set(admin.id, "admin");
      await expect(revokeViewerFromStudy(deps, admin.id, studyA)).rejects.toBeInstanceOf(
        NotAViewerError,
      );
    });
  });

  describe("removeViewerAccount", () => {
    it("deletes a viewer's account", async () => {
      const { userId } = await inviteViewer(deps, {
        email: "pm@example.com",
        studyIds: [studyA],
        origin,
      });
      await removeViewerAccount(deps, userId);
      expect(auth.deleted).toEqual([userId]);
    });

    it("never deletes an admin, or an account with no role", async () => {
      const admin = auth.add("boss@example.com", true);
      store.roles.set(admin.id, "admin");
      const plain = auth.add("plain@example.com", true);

      await expect(removeViewerAccount(deps, admin.id)).rejects.toBeInstanceOf(NotAViewerError);
      await expect(removeViewerAccount(deps, plain.id)).rejects.toBeInstanceOf(NotAViewerError);
      expect(auth.deleted).toEqual([]);
    });
  });

  describe("resendInvite", () => {
    it("emails a fresh link to someone who has not accepted", async () => {
      const { userId } = await inviteViewer(deps, {
        email: "pm@example.com",
        studyIds: [studyA],
        origin,
      });
      email.sent.length = 0;

      await resendInvite(deps, userId, studyA, origin);

      expect(email.sent).toHaveLength(1);
      expect(email.sent[0].html).toContain(`token_hash=token-for-${userId}`);
    });

    it("refuses someone who has already accepted", async () => {
      const { userId } = await inviteViewer(deps, {
        email: "pm@example.com",
        studyIds: [studyA],
        origin,
      });
      auth.accounts.get(userId)!.accepted = true;

      await expect(resendInvite(deps, userId, studyA, origin)).rejects.toBeInstanceOf(
        InviteAlreadyAcceptedError,
      );
    });

    it("refuses a viewer who does not have this study, and an admin", async () => {
      const { userId } = await inviteViewer(deps, {
        email: "pm@example.com",
        studyIds: [studyA],
        origin,
      });
      await expect(resendInvite(deps, userId, studyB, origin)).rejects.toBeInstanceOf(
        NotAViewerError,
      );

      const admin = auth.add("boss@example.com", false);
      store.roles.set(admin.id, "admin");
      await expect(resendInvite(deps, admin.id, studyA, origin)).rejects.toBeInstanceOf(
        NotAViewerError,
      );
    });
  });
});
