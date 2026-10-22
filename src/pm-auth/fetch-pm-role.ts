import type { PmRole } from "./pm-access";

export interface PmRoleLookupConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * Reads a user's role from `pm_roles` over PostgREST with plain `fetch`.
 * Middleware runs on the Edge runtime, where the service-role supabase-js
 * client (which pulls in `ws`) can't be used.
 *
 * Returns null when the user has no role row. Throws when the lookup itself
 * fails, so the caller can answer 503 rather than treating an outage as
 * "no access" or, worse, as "allowed".
 */
export async function fetchPmRole(
  userId: string,
  { supabaseUrl, serviceRoleKey, fetchImpl = fetch }: PmRoleLookupConfig,
): Promise<PmRole | null> {
  const url = `${supabaseUrl}/rest/v1/pm_roles?user_id=eq.${encodeURIComponent(userId)}&select=role`;
  const response = await fetchImpl(url, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`pm_roles lookup failed with status ${response.status}`);
  }
  const rows = (await response.json()) as Array<{ role?: string }>;
  const role = rows[0]?.role;
  return role === "admin" || role === "viewer" ? role : null;
}
