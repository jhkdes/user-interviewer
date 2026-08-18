import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

/**
 * Server-side Supabase client using the service role key.
 * Never import this from client components — the service role key
 * bypasses row-level security and must stay server-only.
 */
export function createServerSupabaseClient(): SupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    // supabase-js's realtime client requires a native WebSocket (Node 22+) unless
    // one is supplied explicitly. We don't use realtime features, but construction
    // still probes for WebSocket — the `ws` polyfill keeps this working on Node 20.
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
