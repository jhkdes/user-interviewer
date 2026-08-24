/**
 * Manual smoke test for the M4 Study & Link Management API routes, run
 * against a live `npm run dev` server. Exercises the full create → get →
 * close → get cycle plus the 400/404 error paths, and prints a pass/fail
 * summary. Requires the dev server already running (and `.env.local`
 * pointed at a real Supabase project, since these hit the real DB).
 *
 * Run with: npm run try:study-api
 * Optionally override the target: BASE_URL=http://localhost:3001 npm run try:study-api
 */

export {};

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const sampleProfile = {
  industry: "Fintech",
  yearsOfExperience: "5-10 years",
  jobTitle: "Product Manager",
  seniority: "Senior",
  responsibility: "Owns the payments roadmap",
};

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

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log(`Testing Study API against ${BASE_URL}\n`);

  console.log("Create study");
  const created = await postJson("/api/studies", { targetProfile: sampleProfile });
  check("returns 201", created.status === 201, created);
  const study = created.body as { id: string; status: string; linkToken: string };
  check("status is open", study.status === "open", study.status);
  check("has a link token", !!study.linkToken, study.linkToken);

  console.log("\nList studies");
  const list = await get("/api/studies");
  check("returns 200", list.status === 200);
  check(
    "includes the created study",
    (list.body as { id: string }[]).some((s) => s.id === study.id),
  );

  console.log("\nGet study by id");
  const fetched = await get(`/api/studies/${study.id}`);
  check("returns 200", fetched.status === 200);
  check("returns the same study", (fetched.body as { id: string }).id === study.id);

  console.log("\nReject invalid target profile");
  const invalid = await postJson("/api/studies", {
    targetProfile: {
      industry: "",
      yearsOfExperience: "",
      jobTitle: "",
      seniority: "",
      responsibility: "",
    },
  });
  check("returns 400", invalid.status === 400, invalid.body);
  check(
    "lists all five missing fields",
    Array.isArray((invalid.body as { fields?: string[] }).fields) &&
      (invalid.body as { fields: string[] }).fields.length === 5,
    invalid.body,
  );

  console.log("\n404 for an unknown study id");
  const missing = await get("/api/studies/00000000-0000-0000-0000-000000000000");
  check("returns 404", missing.status === 404, missing.body);

  console.log("\nClose study");
  const closed = await postJson(`/api/studies/${study.id}/close`, {});
  check("returns 200", closed.status === 200, closed.body);
  check("status is closed", (closed.body as { status: string }).status === "closed");

  console.log("\nGet study after close");
  const afterClose = await get(`/api/studies/${study.id}`);
  check(
    "status is closed",
    (afterClose.body as { status: string }).status === "closed",
    afterClose.body,
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Script failed to run — is `npm run dev` up at", BASE_URL, "?\n", err);
  process.exit(1);
});
