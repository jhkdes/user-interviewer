import type { SupabaseClient, User } from "@supabase/supabase-js";
import { SupabasePmRoleStore } from "@/pm-auth/supabase-pm-role-store";
import type { ViewerAccount, ViewerAuthAdmin, ViewerGrantStore } from "./viewer-sharing";

function toAccount(user: User): ViewerAccount {
  return { id: user.id, email: user.email ?? "", accepted: Boolean(user.email_confirmed_at) };
}

/** Supabase Auth's admin API, behind the interface sharing depends on. */
export class SupabaseViewerAuthAdmin implements ViewerAuthAdmin {
  constructor(private readonly supabase: SupabaseClient) {}

  async findByEmail(email: string): Promise<ViewerAccount | null> {
    // The admin API has no lookup by email. Accounts here number in the
    // handful, so one large page covers them.
    const { data, error } = await this.supabase.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw new Error(`Failed to list accounts: ${error.message}`);
    const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    return user ? toAccount(user) : null;
  }

  async getByIds(ids: string[]): Promise<ViewerAccount[]> {
    const users = await Promise.all(
      ids.map(async (id) => {
        const { data, error } = await this.supabase.auth.admin.getUserById(id);
        if (error) throw new Error(`Failed to read account ${id}: ${error.message}`);
        return data.user;
      }),
    );
    return users.map(toAccount);
  }

  async createInvite(email: string): Promise<{ account: ViewerAccount; tokenHash: string }> {
    const { data, error } = await this.supabase.auth.admin.generateLink({ type: "invite", email });
    if (error) throw new Error(`Failed to create an invite for ${email}: ${error.message}`);
    return { account: toAccount(data.user), tokenHash: data.properties.hashed_token };
  }

  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.deleteUser(userId);
    if (error) throw new Error(`Failed to delete account ${userId}: ${error.message}`);
  }
}

/** Reads (inherited) and writes `pm_roles` and `study_viewer_grants`. */
export class SupabaseViewerGrantStore extends SupabasePmRoleStore implements ViewerGrantStore {
  constructor(private readonly client: SupabaseClient) {
    super(client);
  }

  async ensureViewerRole(userId: string): Promise<void> {
    // ignoreDuplicates: an existing row, whatever its role, is left alone.
    const { error } = await this.client
      .from("pm_roles")
      .upsert(
        { user_id: userId, role: "viewer" },
        { onConflict: "user_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(`Failed to set the viewer role: ${error.message}`);
  }

  async addGrants(userId: string, studyIds: string[]): Promise<void> {
    const rows = studyIds.map((study_id) => ({ user_id: userId, study_id }));
    const { error } = await this.client
      .from("study_viewer_grants")
      .upsert(rows, { onConflict: "user_id,study_id", ignoreDuplicates: true });
    if (error) throw new Error(`Failed to grant access: ${error.message}`);
  }

  async removeGrant(userId: string, studyId: string): Promise<void> {
    const { error } = await this.client
      .from("study_viewer_grants")
      .delete()
      .eq("user_id", userId)
      .eq("study_id", studyId);
    if (error) throw new Error(`Failed to revoke access: ${error.message}`);
  }

  async listGrantedUserIds(studyId: string): Promise<string[]> {
    const { data, error } = await this.client
      .from("study_viewer_grants")
      .select("user_id")
      .eq("study_id", studyId);
    if (error) throw new Error(`Failed to read study_viewer_grants: ${error.message}`);
    return (data ?? []).map((row) => row.user_id as string);
  }
}
