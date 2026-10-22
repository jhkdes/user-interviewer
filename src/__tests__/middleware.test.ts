import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), fetch: vi.fn() }));

vi.mock("@/lib/supabase/middleware-client", () => ({
  createMiddlewareSupabaseClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

import { middleware } from "../middleware";

function request(path: string, method = "GET") {
  return new NextRequest(`http://localhost:3000${path}`, { method });
}

function roleLookupReturns(rows: unknown, status = 200) {
  // A fresh Response per call: a body can only be read once.
  mocks.fetch.mockImplementation(async () => new Response(JSON.stringify(rows), { status }));
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("redirects a signed-out page request to login and answers a signed-out API call with 401", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const page = await middleware(request("/viewer/studies/x"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toContain("/login?redirectTo=%2Fviewer%2Fstudies%2Fx");

    expect((await middleware(request("/api/studies"))).status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("lets an admin through everywhere", async () => {
    roleLookupReturns([{ role: "admin" }]);
    for (const [path, method] of [
      ["/dashboard", "GET"],
      ["/viewer", "GET"],
      ["/api/studies/x", "DELETE"],
    ]) {
      expect((await middleware(request(path, method))).status).toBe(200);
    }
  });

  it("lets a viewer read /viewer pages", async () => {
    roleLookupReturns([{ role: "viewer" }]);
    expect((await middleware(request("/viewer/studies/x"))).status).toBe(200);
  });

  it("sends a viewer who opens a dashboard page to /viewer", async () => {
    roleLookupReturns([{ role: "viewer" }]);
    const res = await middleware(request("/dashboard/studies/x"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/viewer");
  });

  it("answers a viewer's API calls with 403, never a redirect", async () => {
    roleLookupReturns([{ role: "viewer" }]);
    expect((await middleware(request("/api/studies"))).status).toBe(403);
    expect((await middleware(request("/api/studies/x", "DELETE"))).status).toBe(403);
  });

  it("answers 403 for a viewer's non-GET request to a page", async () => {
    roleLookupReturns([{ role: "viewer" }]);
    expect((await middleware(request("/viewer", "POST"))).status).toBe(403);
  });

  it("answers 403 for a signed-in user with no role, on pages and APIs", async () => {
    roleLookupReturns([]);
    expect((await middleware(request("/dashboard"))).status).toBe(403);
    expect((await middleware(request("/viewer"))).status).toBe(403);
    expect((await middleware(request("/api/studies"))).status).toBe(403);
  });

  it("answers 503, not 403 or allow, when the role lookup fails", async () => {
    roleLookupReturns({ message: "boom" }, 500);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await middleware(request("/dashboard"))).status).toBe(503);
    expect((await middleware(request("/api/studies"))).status).toBe(503);
  });

  it("leaves the participant intake route alone", async () => {
    const res = await middleware(request("/api/studies/some-token/interviews", "POST"));
    expect(res.status).toBe(200);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
