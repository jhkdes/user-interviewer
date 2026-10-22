import { describe, expect, it } from "vitest";
import type { PmRole } from "../pm-access";
import { authorizeStudyRead, loadPmContext, type PmContext, type PmRoleStore } from "../pm-context";

function store(roles: Record<string, PmRole>, grants: Record<string, string[]>): PmRoleStore {
  return {
    getRole: async (userId) => roles[userId] ?? null,
    listGrantedStudyIds: async (userId) => grants[userId] ?? [],
  };
}

const ctx = (role: PmContext["role"], grantedStudyIds: string[] = []): PmContext => ({
  userId: "u",
  email: "u@example.com",
  role,
  grantedStudyIds,
});

describe("loadPmContext", () => {
  const s = store({ a: "admin", v: "viewer" }, { v: ["study-1", "study-2"], a: ["ignored"] });

  it("loads a viewer's grants", async () => {
    expect(await loadPmContext("v", "v@x.test", s)).toEqual({
      userId: "v",
      email: "v@x.test",
      role: "viewer",
      grantedStudyIds: ["study-1", "study-2"],
    });
  });

  it("gives an admin no grant list, since admins may read everything", async () => {
    expect((await loadPmContext("a", "a@x.test", s)).grantedStudyIds).toEqual([]);
  });

  it("gives a user with no role no role and no grants", async () => {
    expect(await loadPmContext("nobody", "n@x.test", s)).toMatchObject({
      role: null,
      grantedStudyIds: [],
    });
  });
});

describe("authorizeStudyRead", () => {
  it("is 401 when nobody is signed in", () => {
    expect(authorizeStudyRead(null, "study-1")).toMatchObject({ ok: false, status: 401 });
  });

  it("is 403 for a signed-in user with no role", () => {
    expect(authorizeStudyRead(ctx(null), "study-1")).toMatchObject({ ok: false, status: 403 });
  });

  it("lets an admin read any study and any interview status", () => {
    expect(authorizeStudyRead(ctx("admin"), "study-1")).toEqual({ ok: true });
    expect(authorizeStudyRead(ctx("admin"), "study-1", "in-progress")).toEqual({ ok: true });
  });

  it("lets a viewer read a granted study's completed interview", () => {
    expect(authorizeStudyRead(ctx("viewer", ["study-1"]), "study-1", "completed")).toEqual({
      ok: true,
    });
  });

  it("answers 404 for a study the viewer was not granted", () => {
    expect(authorizeStudyRead(ctx("viewer", ["study-1"]), "study-2", "completed")).toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("answers 404 for a granted study's interview that is not completed", () => {
    for (const status of ["pending", "in-progress", "expired"]) {
      expect(authorizeStudyRead(ctx("viewer", ["study-1"]), "study-1", status)).toMatchObject({
        ok: false,
        status: 404,
      });
    }
  });

  it("answers 404 for a viewer with no grants at all", () => {
    expect(authorizeStudyRead(ctx("viewer", []), "study-1")).toMatchObject({
      ok: false,
      status: 404,
    });
  });
});
