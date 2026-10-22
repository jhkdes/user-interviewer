import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware-client";
import { decidePmAccess, fetchPmRole, requiresAuth } from "@/pm-auth";

/**
 * Route protection (T9.2): redirects an unauthenticated PM to `/login` for
 * `/dashboard/*` and `/viewer/*` pages, and returns 401 for PM-only
 * `/api/studies/*` routes.
 * `requiresAuth` (pure, unit-tested) decides *which* paths need a session;
 * this file only handles *checking* it. `config.matcher` below still limits
 * which requests even reach this function — `requiresAuth` only needs to
 * distinguish within that already-narrowed set (e.g. the intake endpoint
 * from PM-only study routes), not reject `/api/vapi/*` or other pages,
 * which never match in the first place.
 *
 * A session alone is not enough: the user also needs a role in `pm_roles`
 * (VIEWER_ACCESS.md). `decidePmAccess` (pure, unit-tested) decides what each
 * role may do; a user with no role, or a viewer asking for anything outside
 * the viewer allowlist, gets 403.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!requiresAuth(pathname, request.method)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createMiddlewareSupabaseClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isApi = pathname.startsWith("/api/");

  if (!user) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  let role;
  try {
    role = await fetchPmRole(user.id, {
      supabaseUrl: requireEnv("SUPABASE_URL"),
      serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    });
  } catch (err) {
    console.error("PM role lookup failed:", err);
    return isApi
      ? NextResponse.json({ error: "Could not verify access" }, { status: 503 })
      : new NextResponse("Could not verify access. Try again shortly.", { status: 503 });
  }

  if (decidePmAccess({ role, method: request.method, pathname }) === "forbidden") {
    // A viewer who lands on a dashboard page (after login, or from a bookmark)
    // goes to their own read-only pages rather than seeing an error.
    if (role === "viewer" && !isApi && request.method === "GET") {
      return NextResponse.redirect(new URL("/viewer", request.url));
    }
    return isApi
      ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
      : new NextResponse("You don't have access to this page.", { status: 403 });
  }

  return response;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  matcher: ["/dashboard/:path*", "/viewer/:path*", "/api/studies/:path*"],
};
