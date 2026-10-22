/**
 * Creates a real PM account in Supabase Auth and gives it a role. There's no
 * self-serve sign-up page by design (REQUIREMENTS.md specs single-team MVP
 * auth, no sign-up flow) — this is the supported way to provision an account
 * outside the Supabase Dashboard's Authentication -> Users -> Add user UI.
 *
 * A signed-in user with no role in `pm_roles` can't use the dashboard
 * (VIEWER_ACCESS.md), so a role flag is required. For an account that
 * already exists, use `npm run set:pm-role` instead.
 *
 * Run with:
 *   npm run create:pm-account -- --email=you@example.com --password=your-password --admin
 *   npm run create:pm-account -- --email=pm@example.com --password=their-password --viewer
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (already in
 * .env.local, loaded automatically via --env-file).
 */
import { createServerSupabaseClient } from "../src/lib/supabase/client";

const USAGE =
  "Usage: npm run create:pm-account -- --email=you@example.com --password=your-password (--admin | --viewer)";

function parseArgs(): { email: string; password: string; role: "admin" | "viewer" } {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=")];
    }),
  );

  if (!args.email || !args.password || "admin" in args === "viewer" in args) {
    console.error(USAGE);
    process.exit(1);
  }
  if (args.password.length < 6) {
    console.error("Password must be at least 6 characters (Supabase Auth's minimum).");
    process.exit(1);
  }

  return { email: args.email, password: args.password, role: "admin" in args ? "admin" : "viewer" };
}

async function main() {
  const { email, password, role } = parseArgs();
  const admin = createServerSupabaseClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no email-confirmation flow in this MVP — confirmed immediately
  });

  if (error) {
    console.error(`Failed to create account: ${error.message}`);
    process.exit(1);
  }

  const { error: roleError } = await admin
    .from("pm_roles")
    .upsert({ user_id: data.user.id, role }, { onConflict: "user_id" });
  if (roleError) {
    console.error(
      `Account created (id: ${data.user.id}) but setting its role failed: ${roleError.message}\n` +
        "Is migration 0025 applied? Fix it with: npm run set:pm-role -- --email=" +
        `${email} --role=${role}`,
    );
    process.exit(1);
  }

  console.log(`PM account created: ${data.user.email} (id: ${data.user.id}, role: ${role})`);
}

main().catch((err) => {
  console.error("Script failed to run:\n", err);
  process.exit(1);
});
