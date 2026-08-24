import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components and Route Handlers that need the
 * current PM's session (T9.1) — reads/writes the session cookie via
 * `next/headers`. Uses the anon key (not the service-role key from
 * `createServerSupabaseClient` in `./client.ts`), since it acts as the
 * logged-in user, not as an unrestricted backend.
 *
 * Server Components can only *read* cookies, not set them — Supabase calls
 * `set`/`remove` here anyway when a session token needs refreshing, so
 * those calls are wrapped in try/catch. When called from a Server
 * Component, the refreshed cookie silently doesn't get persisted; this is
 * fine because `middleware.ts` already refreshes the session on every
 * matched request before the Server Component runs. This is Supabase's own
 * documented pattern for the Next.js App Router, not a workaround specific
 * to this codebase.
 */
export function createServerComponentSupabaseClient(): SupabaseClient {
  const cookieStore = cookies();
  return createServerClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Called from a Server Component — see doc comment above.
          }
        },
        remove(name: string, options) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // Called from a Server Component — see doc comment above.
          }
        },
      },
    },
  );
}

// Dynamic `process.env[name]` lookup is safe here specifically because this
// file only ever runs server-side (Server Components / Route Handlers),
// where `process.env` is the real thing. Do NOT copy this into a Client
// Component — see the static-access comment in `browser-client.ts`, where
// the same pattern silently breaks because Next.js only inlines
// `NEXT_PUBLIC_*` vars for literal `process.env.NEXT_PUBLIC_X` expressions.
function requirePublicEnv(
  name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY",
): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
