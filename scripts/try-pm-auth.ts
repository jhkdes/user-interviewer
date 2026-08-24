/**
 * Manual verification helper for M9 PM Authentication, run against a live
 * `npm run dev` server and a real Supabase project. Two parts:
 *
 * 1. Automated checks — things a script *can* fully verify without a real
 *    browser: middleware redirects an unauthenticated `/dashboard` request
 *    to `/login`, an unauthenticated PM API route returns 401, and the
 *    Supabase Auth backend itself accepts the right password and rejects
 *    the wrong one for a test PM account (created here if it doesn't exist
 *    yet) — this is the exact REST call `signInWithPassword` makes, so a
 *    pass here proves the credentials/project wiring are correct even
 *    though the script isn't driving the actual React login form.
 * 2. What it can't verify and why: logging in through the real `/login`
 *    form, staying logged in across page loads (real cookies set by
 *    browser JS via @supabase/ssr), logout, and clicking a real
 *    password-reset email link all require an actual browser + a real
 *    inbox. The script prints the test account's credentials and a
 *    click-through checklist for you to run manually — same reasoning as
 *    M6's live Vapi call needing a human.
 *
 * Requires ANTHROPIC_API_KEY not needed here, but SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY must all be set (as they already are in
 * `.env.local` for the rest of the app).
 *
 * Run with: npm run try:pm-auth
 * Optionally override the target: BASE_URL=http://localhost:3001 npm run try:pm-auth
 */
import { createServerSupabaseClient } from "../src/lib/supabase/client";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const TEST_EMAIL = process.env.TEST_PM_EMAIL ?? "pm-auth-smoke-test@example.com";
const TEST_PASSWORD = process.env.TEST_PM_PASSWORD ?? "smoke-test-password-123";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m ${label}`);
    if (detail !== undefined) console.log(`    got: ${JSON.stringify(detail)}`);
    failed++;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function ensureTestUser() {
  const admin = createServerSupabaseClient();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (!createError) return created.user!.id;

  // Already exists from a prior run — reset its password so this script
  // stays idempotent across runs instead of failing on the second one.
  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const existing = list.users.find((u) => u.email === TEST_EMAIL);
  if (!existing) throw createError;

  const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
    password: TEST_PASSWORD,
  });
  if (updateError) throw updateError;
  return existing.id;
}

async function checkPasswordGrant(password: string): Promise<number> {
  const res = await fetch(
    `${requireEnv("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      },
      body: JSON.stringify({ email: TEST_EMAIL, password }),
    },
  );
  return res.status;
}

async function main() {
  console.log(`Setting up a test PM account (${TEST_EMAIL})`);
  await ensureTestUser();
  check("test PM account exists in Supabase Auth", true);

  console.log(`\nAutomated checks against ${BASE_URL}`);

  const dashboardRes = await fetch(`${BASE_URL}/dashboard`, { redirect: "manual" });
  check(
    "unauthenticated GET /dashboard redirects (not 200)",
    dashboardRes.status >= 300 && dashboardRes.status < 400,
    dashboardRes.status,
  );
  const location = dashboardRes.headers.get("location") ?? "";
  check("redirects to /login", location.includes("/login"), location);

  const apiRes = await fetch(`${BASE_URL}/api/studies`);
  check("unauthenticated GET /api/studies returns 401", apiRes.status === 401, apiRes.status);

  const intakeRes = await fetch(`${BASE_URL}/api/studies/some-token/interviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  check(
    "unauthenticated participant intake endpoint is NOT gated by auth (still reachable, fails for its own reasons)",
    intakeRes.status !== 401,
    intakeRes.status,
  );

  console.log("\nSupabase Auth backend checks (same REST call signInWithPassword makes)");
  check("correct password is accepted", (await checkPasswordGrant(TEST_PASSWORD)) === 200);
  check("wrong password is rejected", (await checkPasswordGrant("definitely-wrong")) !== 200);

  console.log(`\n${passed} passed, ${failed} failed`);

  console.log(`
Manual click-through still needed (real browser + real inbox — can't be scripted):
  1. Visit ${BASE_URL}/login, log in with:
       email:    ${TEST_EMAIL}
       password: ${TEST_PASSWORD}
     -> should land on /dashboard showing "Logged in as ${TEST_EMAIL}"
  2. Click "Log out" -> should return to /login; visiting /dashboard again should redirect back to /login
  3. From /login, click "Forgot password?", submit ${TEST_EMAIL}
     -> check that inbox for a reset email, click the link
     -> should land on /reset-password; set a new password -> should land on /dashboard logged in
`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Script failed to run — is `npm run dev` up at", BASE_URL, "?\n", err);
  process.exit(1);
});
