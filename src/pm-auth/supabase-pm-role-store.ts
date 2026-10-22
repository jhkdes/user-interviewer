import type { SupabaseClient } from "@supabase/supabase-js";
import type { PmRole } from "./pm-access";
import type { PmRoleStore } from "./pm-context";

/** Reads `pm_roles` and `study_viewer_grants` with the service-role client. */
export class SupabasePmRoleStore implements PmRoleStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async getRole(userId: string): Promise<PmRole | null> {
    const { data, error } = await this.supabase
      .from("pm_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to read pm_roles: ${error.message}`);
    return data?.role === "admin" || data?.role === "viewer" ? data.role : null;
  }

  async listGrantedStudyIds(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("study_viewer_grants")
      .select("study_id")
      .eq("user_id", userId);
    if (error) throw new Error(`Failed to read study_viewer_grants: ${error.message}`);
    return (data ?? []).map((row) => row.study_id as string);
  }
}
