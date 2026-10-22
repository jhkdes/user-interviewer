import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { decidePmAccess, type ViewerRoute } from "../pm-access";
import { fetchPmRole } from "../fetch-pm-role";
import { requiresAuth } from "../route-protection";

const API_DIR = path.resolve(__dirname, "../../app/api/studies");
const DASHBOARD_DIR = path.resolve(__dirname, "../../app/dashboard");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function walk(dir: string, match: (file: string) => boolean): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full, match) : match(entry.name) ? [full] : [];
  });
}

/** `.../studies/[id]/close/route.ts` -> `/api/studies/x/close` */
function toPathname(file: string, root: string, prefix: string): string {
  const relative = path.relative(root, path.dirname(file)).split(path.sep).filter(Boolean);
  const segments = relative.map((s) => (s.startsWith("[") ? "x" : s));
  return [prefix, ...segments].join("/");
}

describe("decidePmAccess", () => {
  it("allows an admin everything", () => {
    for (const method of METHODS) {
      expect(decidePmAccess({ role: "admin", method, pathname: "/api/studies/x" })).toBe("allow");
    }
    expect(decidePmAccess({ role: "admin", method: "GET", pathname: "/dashboard" })).toBe("allow");
  });

  it("forbids a signed-in user who has no role", () => {
    expect(decidePmAccess({ role: null, method: "GET", pathname: "/dashboard" })).toBe("forbidden");
    expect(decidePmAccess({ role: null, method: "GET", pathname: "/api/studies" })).toBe(
      "forbidden",
    );
  });

  it("forbids a viewer from everything while the viewer allowlist is empty", () => {
    expect(decidePmAccess({ role: "viewer", method: "GET", pathname: "/dashboard" })).toBe(
      "forbidden",
    );
    expect(decidePmAccess({ role: "viewer", method: "GET", pathname: "/api/studies/x" })).toBe(
      "forbidden",
    );
  });

  it("lets a viewer through only for an allowlisted GET", () => {
    const viewerRoutes: ViewerRoute[] = [{ method: "GET", pattern: /^\/api\/studies\/[^/]+$/ }];
    const decide = (method: string, pathname: string) =>
      decidePmAccess({ role: "viewer", method, pathname, viewerRoutes });

    expect(decide("GET", "/api/studies/x")).toBe("allow");
    expect(decide("DELETE", "/api/studies/x")).toBe("forbidden");
    expect(decide("PATCH", "/api/studies/x")).toBe("forbidden");
    expect(decide("GET", "/api/studies/x/transcripts")).toBe("forbidden");
  });
});

describe("viewer access to every existing PM route", () => {
  const apiRoutes = walk(API_DIR, (name) => name === "route.ts").flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    const pathname = toPathname(file, API_DIR, "/api/studies");
    return METHODS.filter((m) => new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(source))
      .filter((method) => requiresAuth(pathname, method))
      .map((method) => ({ method, pathname }));
  });

  it("finds the existing PM API handlers", () => {
    // Guards the enumeration itself: if the walk silently found nothing, the
    // table below would pass vacuously.
    expect(apiRoutes.length).toBeGreaterThan(15);
    expect(apiRoutes).toContainEqual({ method: "DELETE", pathname: "/api/studies/x" });
    expect(apiRoutes).toContainEqual({ method: "DELETE", pathname: "/api/studies/x/interviews/x" });
  });

  it.each(apiRoutes)("forbids a viewer: $method $pathname", ({ method, pathname }) => {
    expect(decidePmAccess({ role: "viewer", method, pathname })).toBe("forbidden");
  });

  it.each(apiRoutes)("forbids a role-less user: $method $pathname", ({ method, pathname }) => {
    expect(decidePmAccess({ role: null, method, pathname })).toBe("forbidden");
  });

  const pages = walk(DASHBOARD_DIR, (name) => name === "page.tsx").map((file) =>
    toPathname(file, DASHBOARD_DIR, "/dashboard"),
  );

  it("finds the dashboard pages", () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  it.each(pages)("forbids a viewer from the page %s", (pathname) => {
    expect(requiresAuth(pathname, "GET")).toBe(true);
    expect(decidePmAccess({ role: "viewer", method: "GET", pathname })).toBe("forbidden");
  });
});

describe("fetchPmRole", () => {
  const config = { supabaseUrl: "https://example.supabase.co", serviceRoleKey: "service-key" };

  function respondWith(body: unknown, status = 200) {
    return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  }

  it("returns the role from the matching row", async () => {
    const fetchImpl = respondWith([{ role: "viewer" }]);
    await expect(fetchPmRole("user-1", { ...config, fetchImpl })).resolves.toBe("viewer");

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/rest/v1/pm_roles?user_id=eq.user-1&select=role");
    expect(init.headers).toMatchObject({
      apikey: "service-key",
      Authorization: "Bearer service-key",
    });
  });

  it("returns null when the user has no row", async () => {
    await expect(fetchPmRole("user-1", { ...config, fetchImpl: respondWith([]) })).resolves.toBe(
      null,
    );
  });

  it("returns null for an unrecognised role value", async () => {
    await expect(
      fetchPmRole("user-1", { ...config, fetchImpl: respondWith([{ role: "owner" }]) }),
    ).resolves.toBe(null);
  });

  it("throws, rather than returning null, when the lookup fails", async () => {
    await expect(
      fetchPmRole("user-1", { ...config, fetchImpl: respondWith({ message: "boom" }, 500) }),
    ).rejects.toThrow(/status 500/);
  });

  it("encodes the user id in the query", async () => {
    const fetchImpl = respondWith([]);
    await fetchPmRole("a&role=eq.admin", { ...config, fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toContain("user_id=eq.a%26role%3Deq.admin");
  });
});

describe("requiresAuth intake exemption", () => {
  it("exempts only POST to the exact intake path", () => {
    expect(requiresAuth("/api/studies/token/interviews", "POST")).toBe(false);
    expect(requiresAuth("/api/studies/token/interviews", "GET")).toBe(true);
    expect(requiresAuth("/api/studies/token/interviews", "DELETE")).toBe(true);
  });

  it("does not exempt deeper or look-alike paths", () => {
    expect(requiresAuth("/api/studies/x/interviews/y", "POST")).toBe(true);
    expect(requiresAuth("/api/studies/x/y/interviews", "POST")).toBe(true);
    expect(requiresAuth("/api/studies/interviews", "POST")).toBe(true);
  });
});
