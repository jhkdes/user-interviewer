import { NextResponse, type NextRequest } from "next/server";
import { createMiddlewareSupabaseClient } from "@/lib/supabase/middleware-client";
import { requiresAuth } from "@/pm-auth";

/**
 * Route protection (T9.2): redirects an unauthenticated PM to `/login` for
 * `/dashboard/*` pages, and returns 401 for PM-only `/api/studies/*` routes.
 * `requiresAuth` (pure, unit-tested) decides *which* paths need a session;
 * this file only handles *checking* it. `config.matcher` below still limits
 * which requests even reach this function — `requiresAuth` only needs to
 * distinguish within that already-narrowed set (e.g. the intake endpoint
 * from PM-only study routes), not reject `/api/vapi/*` or other pages,
 * which never match in the first place.
 */
export async function middleware(request: NextRequest) {
  if (!requiresAuth(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const supabase = createMiddlewareSupabaseClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return response;

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/studies/:path*"],
};
