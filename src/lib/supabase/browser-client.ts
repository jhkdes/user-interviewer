import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client for PM Auth (T9.1) — anon key only, session
 * stored in cookies (via @supabase/ssr) so the server (middleware, Server
 * Components, Route Handlers) can read the same session. Only ever call
 * this from Client Components.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  // Next.js only inlines `NEXT_PUBLIC_*` vars at build time when it sees a
  // static, literal `process.env.NEXT_PUBLIC_X` expression — a helper that
  // reads `process.env[name]` via a variable isn't statically analyzable,
  // so it never gets replaced and silently reads `undefined` in the browser
  // (there's no real `process.env` there, only whatever got inlined). Both
  // vars are therefore read as literal expressions right here, not through
  // a shared dynamic-lookup helper like the server-side client files use.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) {
    throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createBrowserClient(url, anonKey);
}
