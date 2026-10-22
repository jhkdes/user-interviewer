export type PmRole = "admin" | "viewer";

export type PmAccessDecision = "allow" | "forbidden";

/**
 * A request a viewer is allowed to make. Each entry must be a GET that only
 * reaches viewer-safe data (VIEWER_ACCESS.md): today that is the read-only
 * `/viewer` pages, which read through `loadViewerStudy` and check the
 * viewer's study grants themselves. Every existing `/dashboard` page and
 * `/api/studies` route returns participant names and emails, so none of them
 * is listed.
 */
export interface ViewerRoute {
  method: "GET";
  pattern: RegExp;
}

export const VIEWER_ALLOWED_ROUTES: readonly ViewerRoute[] = [
  { method: "GET", pattern: /^\/viewer(\/|$)/ },
];

/**
 * Decides whether a signed-in dashboard user may make a request to a path
 * that already `requiresAuth`. Deny by default: no role is forbidden, an
 * admin is allowed everything, and a viewer is allowed only what
 * `VIEWER_ALLOWED_ROUTES` lists.
 */
export function decidePmAccess(input: {
  role: PmRole | null;
  method: string;
  pathname: string;
  viewerRoutes?: readonly ViewerRoute[];
}): PmAccessDecision {
  const { role, method, pathname, viewerRoutes = VIEWER_ALLOWED_ROUTES } = input;
  if (role === "admin") return "allow";
  if (role === "viewer") {
    const allowed = viewerRoutes.some(
      (route) => route.method === method && route.pattern.test(pathname),
    );
    return allowed ? "allow" : "forbidden";
  }
  return "forbidden";
}
