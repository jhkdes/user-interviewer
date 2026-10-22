import { createServerSupabaseClient } from "@/lib/supabase/client";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server-client";
import { loadPmContext, type PmContext } from "./pm-context";
import { SupabasePmRoleStore } from "./supabase-pm-role-store";

/**
 * The signed-in dashboard user for the current request, with their role and
 * study grants, or null when nobody is signed in. For route handlers and
 * server components that sit outside the middleware matcher, or that need
 * the grants (the middleware only checks the role). Server-only: it is not
 * exported from the package index because middleware imports that on the
 * Edge runtime.
 */
export async function getCurrentPmContext(): Promise<PmContext | null> {
  const {
    data: { user },
  } = await createServerComponentSupabaseClient().auth.getUser();
  if (!user) return null;
  return loadPmContext(
    user.id,
    user.email ?? "",
    new SupabasePmRoleStore(createServerSupabaseClient()),
  );
}
