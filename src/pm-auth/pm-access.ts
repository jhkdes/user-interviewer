export type PmRole = "admin" | "viewer";

export type PmAccessDecision = "allow" | "forbidden";

/**
 * A request a viewer is allowed to make. Empty on purpose until the viewer
 * data projection exists (VIEWER_ACCESS.md, M2/M3): today every study and
 * interview route returns participant names and emails, so a viewer must
 * not reach any of them. Each entry added later must be a GET that returns
 * only viewer-safe data.
 */
export interface ViewerRoute {
  method: "GET";
  pattern: RegExp;
}

export const VIEWER_ALLOWED_ROUTES: readonly ViewerRoute[] = [];

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
