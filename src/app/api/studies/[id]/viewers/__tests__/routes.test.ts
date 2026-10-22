import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AlreadyAdminError, InviteEmailError, NotAViewerError } from "@/viewer-sharing";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getStudyById: vi.fn(),
  inviteViewer: vi.fn(),
  listStudyViewers: vi.fn(),
  revokeViewerFromStudy: vi.fn(),
  removeViewerAccount: vi.fn(),
  resendInvite: vi.fn(),
}));

vi.mock("@/pm-auth/require-admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/repositories/get-study-repository", () => ({
  getStudyRepository: () => ({ getById: mocks.getStudyById }),
}));
vi.mock("@/viewer-sharing/get-viewer-sharing-deps", () => ({
  getViewerSharingDeps: () => ({ marker: "deps" }),
}));
vi.mock("@/viewer-sharing", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/viewer-sharing")>()),
  inviteViewer: mocks.inviteViewer,
  listStudyViewers: mocks.listStudyViewers,
  revokeViewerFromStudy: mocks.revokeViewerFromStudy,
  removeViewerAccount: mocks.removeViewerAccount,
  resendInvite: mocks.resendInvite,
}));

import { GET, POST } from "../route";
import { DELETE } from "../[userId]/route";
import { POST as RESEND } from "../[userId]/resend/route";

const USER = "11111111-1111-4111-8111-111111111111";
const json = (body: unknown) =>
  new Request("http://localhost:3000/api/studies/s1/viewers", {
    method: "POST",
    body: JSON.stringify(body),
  });

describe("viewer sharing routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.getStudyById.mockResolvedValue({ id: "s1" });
  });

  describe("only an admin may use them", () => {
    const denied = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

    it("answers with the denial and does nothing else", async () => {
      mocks.requireAdmin.mockResolvedValue(denied());
      const params = { id: "s1", userId: USER };

      const responses = await Promise.all([
        GET(new Request("http://x"), { params }),
        POST(json({ email: "a@b.co" }), { params }),
        DELETE(new Request("http://x", { method: "DELETE" }), { params }),
        RESEND(new Request("http://x", { method: "POST" }), { params }),
      ]);

      expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403]);
      for (const fn of [
        mocks.inviteViewer,
        mocks.listStudyViewers,
        mocks.revokeViewerFromStudy,
        mocks.removeViewerAccount,
        mocks.resendInvite,
      ]) {
        expect(fn).not.toHaveBeenCalled();
      }
    });
  });

  describe("GET", () => {
    it("returns the study's viewers", async () => {
      mocks.listStudyViewers.mockResolvedValue([
        { userId: USER, email: "a@b.co", status: "active" },
      ]);
      const res = await GET(new Request("http://x"), { params: { id: "s1" } });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        viewers: [{ userId: USER, email: "a@b.co", status: "active" }],
      });
    });

    it("is 404 for an unknown study", async () => {
      mocks.getStudyById.mockResolvedValue(null);
      expect((await GET(new Request("http://x"), { params: { id: "nope" } })).status).toBe(404);
    });
  });

  describe("POST", () => {
    it("invites for this study, using the request's origin for the link", async () => {
      mocks.inviteViewer.mockResolvedValue({ userId: USER, email: "a@b.co", outcome: "invited" });

      const res = await POST(json({ email: "a@b.co" }), { params: { id: "s1" } });

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ outcome: "invited" });
      expect(mocks.inviteViewer).toHaveBeenCalledWith(
        { marker: "deps" },
        { email: "a@b.co", studyIds: ["s1"], origin: "http://localhost:3000" },
      );
    });

    it("is 400 without an email", async () => {
      expect((await POST(json({}), { params: { id: "s1" } })).status).toBe(400);
      expect((await POST(json({ email: 5 }), { params: { id: "s1" } })).status).toBe(400);
      expect(mocks.inviteViewer).not.toHaveBeenCalled();
    });

    it("is 409 for an admin's email", async () => {
      mocks.inviteViewer.mockRejectedValue(new AlreadyAdminError("boss@b.co"));
      expect((await POST(json({ email: "boss@b.co" }), { params: { id: "s1" } })).status).toBe(409);
    });

    it("is 502 when the email could not be sent, and says access was set up", async () => {
      mocks.inviteViewer.mockRejectedValue(new InviteEmailError("a@b.co", new Error("down")));
      const res = await POST(json({ email: "a@b.co" }), { params: { id: "s1" } });
      expect(res.status).toBe(502);
      expect((await res.json()).error).toMatch(/Try Resend/);
    });

    it("lets an unexpected failure surface as a server error", async () => {
      mocks.inviteViewer.mockRejectedValue(new Error("database is down"));
      await expect(POST(json({ email: "a@b.co" }), { params: { id: "s1" } })).rejects.toThrow(
        "database is down",
      );
    });
  });

  describe("DELETE", () => {
    const call = (query = "") =>
      DELETE(new Request(`http://x/api/studies/s1/viewers/${USER}${query}`, { method: "DELETE" }), {
        params: { id: "s1", userId: USER },
      });

    it("removes the viewer from this study by default", async () => {
      expect((await call()).status).toBe(204);
      expect(mocks.revokeViewerFromStudy).toHaveBeenCalledWith({ marker: "deps" }, USER, "s1");
      expect(mocks.removeViewerAccount).not.toHaveBeenCalled();
    });

    it("deletes the account with ?scope=account", async () => {
      expect((await call("?scope=account")).status).toBe(204);
      expect(mocks.removeViewerAccount).toHaveBeenCalledWith({ marker: "deps" }, USER);
      expect(mocks.revokeViewerFromStudy).not.toHaveBeenCalled();
    });

    it("is 404 for someone who is not a viewer", async () => {
      mocks.revokeViewerFromStudy.mockRejectedValue(new NotAViewerError());
      expect((await call()).status).toBe(404);
    });

    it("is 404 for a user id that is not a UUID, without calling anything", async () => {
      const res = await DELETE(new Request("http://x", { method: "DELETE" }), {
        params: { id: "s1", userId: "not-a-uuid" },
      });
      expect(res.status).toBe(404);
      expect(mocks.revokeViewerFromStudy).not.toHaveBeenCalled();
    });
  });

  describe("resend", () => {
    it("emails a fresh invite, using the request's origin", async () => {
      const res = await RESEND(new Request("http://localhost:3000/x", { method: "POST" }), {
        params: { id: "s1", userId: USER },
      });
      expect(res.status).toBe(204);
      expect(mocks.resendInvite).toHaveBeenCalledWith(
        { marker: "deps" },
        USER,
        "s1",
        "http://localhost:3000",
      );
    });
  });
});
