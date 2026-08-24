import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Supabase client for `middleware.ts` (T9.2) — reads the session cookie off
 * the incoming request and writes any refreshed session back onto the
 * outgoing response, so `auth.getUser()` both validates and keeps the PM's
 * session alive across requests.
 */
export function createMiddlewareSupabaseClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );
}

// Dynamic `process.env[name]` lookup is safe here specifically because
// middleware runs server-side, where `process.env` is the real thing. Do
// NOT copy this into a Client Component — see the static-access comment in
// `browser-client.ts`, where the same pattern silently breaks because
// Next.js only inlines `NEXT_PUBLIC_*` vars for literal
// `process.env.NEXT_PUBLIC_X` expressions.
function requirePublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY",
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
