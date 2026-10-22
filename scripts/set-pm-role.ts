/**
 * Sets the role of an existing Supabase Auth account in `pm_roles`
 * (VIEWER_ACCESS.md). Use it to make an account that predates roles an
 * admin, or to change a role later.
 *
 * Run with:
 *   npm run set:pm-role -- --email=you@example.com --role=admin
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (already in
 * .env.local, loaded automatically via --env-file).
 */
import { createServerSupabaseClient } from "../src/lib/supabase/client";

const USAGE = "Usage: npm run set:pm-role -- --email=you@example.com --role=admin|viewer";

function parseArgs(): { email: string; role: "admin" | "viewer" } {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=")];
    }),
  );

  if (!args.email || (args.role !== "admin" && args.role !== "viewer")) {
    console.error(USAGE);
    process.exit(1);
  }
  return { email: args.email, role: args.role };
}

async function main() {
  const { email, role } = parseArgs();
  const admin = createServerSupabaseClient();

  // listUsers is paged; accounts here number in the handful, so one large page is enough.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error(`Failed to list accounts: ${error.message}`);
    process.exit(1);
  }

  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No account found for ${email}. Create one with npm run create:pm-account.`);
    process.exit(1);
  }

  const { error: roleError } = await admin
    .from("pm_roles")
    .upsert({ user_id: user.id, role }, { onConflict: "user_id" });
  if (roleError) {
    console.error(`Failed to set role: ${roleError.message} (is migration 0025 applied?)`);
    process.exit(1);
  }

  console.log(`Role set: ${user.email} (id: ${user.id}) is now ${role}`);
}

main().catch((err) => {
  console.error("Script failed to run:\n", err);
  process.exit(1);
});
