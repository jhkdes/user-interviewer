/**
 * Smoke test for read-only viewer access (VIEWER_ACCESS.md), run against a
 * live site and its real Supabase project. Use it before inviting a viewer,
 * and again after any deploy that touches auth.
 *
 * It creates temporary accounts (one viewer granted one study, one with no
 * role), signs them in, and checks over HTTP that:
 *   - signed-out and role-less visitors are kept out,
 *   - a viewer is refused every dashboard page and every write,
 *   - a viewer can read the granted study, and only that study,
 *   - the viewer's pages show no participant first name, email address,
 *     tracking id or participant link, for every completed interview,
 *   - the viewer's pages have no form, export or dashboard link.
 * Then it deletes the temporary accounts. It sends no email and changes no
 * study data; write attempts use an id that does not exist.
 *
 * Run with:
 *   npm run verify:viewer-access -- --base=https://your-site [--study=<study id>]
 *
 * Defaults to http://localhost:3000 and to the first study that has a
 * completed interview. Needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for the project
 * the site uses (loaded from .env.local by the npm script, so point that at
 * the right project when checking a deployed site).
 */
import { createServerClient } from "@supabase/ssr";
import WebSocket from "ws";
import { createServerSupabaseClient } from "../src/lib/supabase/client";

// Node 20 has no native WebSocket, which supabase-js probes for on construction.
(globalThis as { WebSocket?: unknown }).WebSocket ??= WebSocket;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
);
const BASE = (args.base || "http://localhost:3000").replace(/\/+$/, "");
const ZERO_ID = "00000000-0000-0000-0000-000000000000";
const PASSWORD = `Tmp-${Date.now()}-pw`;

const admin = createServerSupabaseClient();
const createdUserIds: string[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  -> ${detail}` : ""}`);
}

async function makeUser(label: string, role: "viewer" | null) {
  const email = `tmp-verify-${label}-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  createdUserIds.push(data.user.id);
  if (role) {
    const { error: roleError } = await admin
      .from("pm_roles")
      .insert({ user_id: data.user.id, role });
    if (roleError) throw roleError;
  }
  return { id: data.user.id, email };
}

async function signIn(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => jar.get(n),
        set: (n: string, v: string) => void jar.set(n, v),
        remove: (n: string) => void jar.delete(n),
      },
    },
  );
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return [...jar].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
}

async function request(cookie: string, method: string, path: string) {
  const res = await fetch(BASE + path, {
    method,
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: res.status, location: res.headers.get("location"), text: await res.text() };
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
const visibleText = (html: string) =>
  decode(html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]*>/g, " "));
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function main() {
  console.log(`Checking ${BASE}\n`);

  let studyId: string | undefined = args.study;
  if (!studyId) {
    const { data } = await admin
      .from("interviews")
      .select("study_id")
      .eq("status", "completed")
      .limit(1);
    studyId = data?.[0]?.study_id as string | undefined;
  }
  if (!studyId) throw new Error("No study with a completed interview found; pass --study=<id>.");

  const { data: interviews } = await admin
    .from("interviews")
    .select("id, first_name, email, tracking_id, status")
    .eq("study_id", studyId);
  const completed = (interviews ?? []).filter((i) => i.status === "completed");
  const { data: study } = await admin
    .from("studies")
    .select("link_token, text_link_token")
    .eq("id", studyId)
    .single();
  const { data: others } = await admin.from("studies").select("id").neq("id", studyId).limit(1);
  const otherStudyId = others?.[0]?.id as string | undefined;
  console.log(
    `Study under test has ${interviews?.length ?? 0} interviews, ${completed.length} completed\n`,
  );

  const viewer = await makeUser("viewer", "viewer");
  const noRole = await makeUser("norole", null);
  await admin.from("study_viewer_grants").insert({ user_id: viewer.id, study_id: studyId });
  const viewerCookie = await signIn(viewer.email);
  const noRoleCookie = await signIn(noRole.email);

  console.log("--- signed out");
  const out = await request("", "GET", "/viewer");
  check(
    "/viewer redirects to login",
    out.status >= 300 && out.status < 400 && /login/.test(out.location ?? ""),
    String(out.status),
  );
  check("/api/studies is 401", (await request("", "GET", "/api/studies")).status === 401);
  if (completed[0]) {
    check(
      "recording is 401",
      (await request("", "GET", `/api/interviews/${completed[0].id}/recording`)).status === 401,
    );
  }

  console.log("--- signed in with no role");
  check("/dashboard is 403", (await request(noRoleCookie, "GET", "/dashboard")).status === 403);
  check("/viewer is 403", (await request(noRoleCookie, "GET", "/viewer")).status === 403);
  check("/api/studies is 403", (await request(noRoleCookie, "GET", "/api/studies")).status === 403);

  console.log("--- viewer is kept out of everything but the viewer pages");
  const dash = await request(viewerCookie, "GET", "/dashboard");
  check(
    "/dashboard sends them to /viewer",
    dash.status === 307 && /\/viewer$/.test(dash.location ?? ""),
    `${dash.status} ${dash.location}`,
  );
  for (const [method, path] of [
    ["GET", "/api/studies"],
    ["GET", `/api/studies/${studyId}/transcripts`],
    ["GET", `/api/studies/${studyId}/viewers`],
    ["POST", `/api/studies/${studyId}/viewers`],
    ["DELETE", `/api/studies/${ZERO_ID}`],
    ["DELETE", `/api/studies/${ZERO_ID}/interviews/${ZERO_ID}`],
    ["POST", `/api/studies/${ZERO_ID}/close`],
  ]) {
    check(
      `${method} ${path.replace(studyId, "<study>").replace(new RegExp(ZERO_ID, "g"), "<none>")} is 403`,
      (await request(viewerCookie, method, path)).status === 403,
    );
  }

  console.log("--- viewer reads the granted study");
  const home = await request(viewerCookie, "GET", "/viewer");
  check(
    "/viewer is 200 and lists the study",
    home.status === 200 && home.text.includes(`/viewer/studies/${studyId}`),
    String(home.status),
  );
  const studyPage = await request(viewerCookie, "GET", `/viewer/studies/${studyId}`);
  check("study page is 200", studyPage.status === 200, String(studyPage.status));

  const pages = new Map<string, string>();
  let nonOk = 0;
  for (const row of completed) {
    const page = await request(
      viewerCookie,
      "GET",
      `/viewer/studies/${studyId}/interviews/${row.id}`,
    );
    if (page.status !== 200) nonOk++;
    pages.set(row.id, page.text);
  }
  check(
    `all ${completed.length} completed interview pages are 200`,
    nonOk === 0,
    `${nonOk} not 200`,
  );

  console.log("--- viewer cannot read anything else");
  check(
    "an unknown study is 404",
    (await request(viewerCookie, "GET", `/viewer/studies/${ZERO_ID}`)).status === 404,
  );
  if (otherStudyId) {
    check(
      "a study they were not granted is 404",
      (await request(viewerCookie, "GET", `/viewer/studies/${otherStudyId}`)).status === 404,
    );
    const { data: otherInterview } = await admin
      .from("interviews")
      .select("id")
      .eq("study_id", otherStudyId)
      .eq("status", "completed")
      .limit(1);
    if (otherInterview?.[0]) {
      check(
        "another study's recording is 404",
        (await request(viewerCookie, "GET", `/api/interviews/${otherInterview[0].id}/recording`))
          .status === 404,
      );
    }
  }

  console.log("--- no participant identity in what the viewer sees");
  let ownNameHits = 0;
  for (const row of completed) {
    const name = row.first_name?.trim();
    if (!name) continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, "iu");
    if (re.test(visibleText(pages.get(row.id) ?? ""))) ownNameHits++;
  }
  check(
    "no interview page shows its own participant's first name",
    ownNameHits === 0,
    `${ownNameHits} pages`,
  );

  const everything = [home.text, studyPage.text, ...pages.values()].join("\n");
  const secrets = new Set<string>();
  for (const r of interviews ?? []) {
    for (const v of [r.email, r.tracking_id]) if (v?.trim()) secrets.add(v.trim().toLowerCase());
  }
  for (const v of [study?.link_token, study?.text_link_token])
    if (v) secrets.add(String(v).toLowerCase());
  const leaked = [...secrets].filter((v) => everything.toLowerCase().includes(v)).length;
  check(
    `no email, tracking id or participant link appears (${secrets.size} values checked)`,
    leaked === 0,
    `${leaked} found`,
  );

  const listText = visibleText(home.text + studyPage.text);
  const listed = (interviews ?? []).filter((r) => {
    const name = r.first_name?.trim();
    return (
      name &&
      name.length >= 3 &&
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name)}(?![\\p{L}\\p{N}])`, "iu").test(listText)
    );
  }).length;
  check("the study page lists no participant first name", listed === 0, `${listed} found`);

  const noControls = !/<form|<input|<textarea|\/export|\/dashboard|\/api\/studies/i.test(
    everything.replace(/<script[\s\S]*?<\/script>/g, ""),
  );
  check("the pages have no form, export or dashboard link", noControls);

  console.log(
    "\nNot checked here: invite emails arriving, audio playing in a browser, how the pages look.",
  );
}

main()
  .catch((err) => {
    failures++;
    console.error("Script error:", err);
  })
  .finally(async () => {
    for (const id of createdUserIds) await admin.auth.admin.deleteUser(id).catch(() => {});
    console.log(`\nRemoved ${createdUserIds.length} temporary accounts. Failures: ${failures}`);
    process.exit(failures ? 1 : 0);
  });
