/**
 * Creates a real PM account in Supabase Auth. There's no self-serve sign-up
 * page by design (REQUIREMENTS.md specs single-team MVP auth, no sign-up
 * flow) — this is the supported way to provision an account outside the
 * Supabase Dashboard's Authentication -> Users -> Add user UI.
 *
 * Run with:
 *   npm run create:pm-account -- --email=you@example.com --password=your-password
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (already in
 * .env.local, loaded automatically via --env-file).
 */
import { createServerSupabaseClient } from "../src/lib/supabase/client";

function parseArgs(): { email: string; password: string } {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=")];
    }),
  );

  if (!args.email || !args.password) {
    console.error(
      "Usage: npm run create:pm-account -- --email=you@example.com --password=your-password",
    );
    process.exit(1);
  }
  if (args.password.length < 6) {
    console.error("Password must be at least 6 characters (Supabase Auth's minimum).");
    process.exit(1);
  }

  return { email: args.email, password: args.password };
}

async function main() {
  const { email, password } = parseArgs();
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

  console.log(`PM account created: ${data.user.email} (id: ${data.user.id})`);
}

main().catch((err) => {
  console.error("Script failed to run:\n", err);
  process.exit(1);
});
