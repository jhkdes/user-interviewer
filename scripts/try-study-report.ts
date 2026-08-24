/**
 * Manual smoke test for the M8 Study Report Generation API, run against a
 * live `npm run dev` server. Drives the full pipeline end to end — create
 * study → intake two participants → complete each via a simulated Vapi
 * `end-of-call-report` (which auto-triggers M7's individual summary
 * generation) → generate the study report — plus the 404/422 error paths,
 * and prints a pass/fail summary. Requires the dev server already running
 * (and `.env.local` pointed at a real Supabase project + a real
 * `ANTHROPIC_API_KEY`, since this makes real LLM calls for both the
 * individual summaries and the study report).
 *
 * Run with: npm run try:study-report
 * Optionally override the target: BASE_URL=http://localhost:3001 npm run try:study-report
 */

export {};

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const sampleProfile = {
  industry: "SaaS",
  yearsOfExperience: "5-10 years",
  jobTitle: "Engineering Manager",
  seniority: "Manager",
  responsibility: "Owns team delivery",
};

const participants = [
  {
    firstName: "Jordan",
    email: "jordan@example.com",
    roleDescription: "Engineering manager",
    transcript: [
      { role: "bot", message: "How's your week going?", secondsFromStart: 0 },
      {
        role: "user",
        message:
          "Buried in status reports, honestly. I spend three hours every Friday manually copying numbers into a slide deck.",
        secondsFromStart: 4,
      },
      {
        role: "bot",
        message: "What's the most painful part of that process?",
        secondsFromStart: 10,
      },
      {
        role: "user",
        message:
          "When the upstream export format changes without warning, my whole template breaks and I have to redo it by hand.",
        secondsFromStart: 16,
      },
    ],
  },
  {
    firstName: "Alex",
    email: "alex@example.com",
    roleDescription: "Product manager",
    transcript: [
      { role: "bot", message: "Tell me about a recent frustrating workflow.", secondsFromStart: 0 },
      {
        role: "user",
        message:
          "Coordinating launch dates across three teams is a nightmare — everyone uses a different spreadsheet.",
        secondsFromStart: 5,
      },
      {
        role: "bot",
        message: "What happens when those spreadsheets get out of sync?",
        secondsFromStart: 12,
      },
      {
        role: "user",
        message:
          "We ship the wrong messaging because marketing didn't see the engineering slip in time.",
        secondsFromStart: 18,
      },
    ],
  },
];

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

async function completeInterview(
  interviewId: string,
  transcript: (typeof participants)[number]["transcript"],
) {
  return postJson("/api/vapi/webhook", {
    message: {
      type: "end-of-call-report",
      call: { assistantOverrides: { metadata: { interviewId } } },
      artifact: {
        messages: transcript,
        recordingUrl: `https://example.test/${interviewId}.mp3`,
      },
    },
  });
}

async function main() {
  console.log(`Testing Study Report API against ${BASE_URL}\n`);

  console.log("Create study");
  const created = await postJson("/api/studies", { targetProfile: sampleProfile });
  check("returns 201", created.status === 201, created);
  const study = created.body as { id: string; linkToken: string };

  console.log("\nIntake participants and complete their interviews");
  const interviewIds: string[] = [];
  for (const participant of participants) {
    const intake = await postJson(`/api/studies/${study.linkToken}/interviews`, {
      firstName: participant.firstName,
      email: participant.email,
      roleDescription: participant.roleDescription,
      consentGiven: true,
    });
    check(`${participant.firstName}: intake returns 201`, intake.status === 201, intake.body);
    const interview = intake.body as { id: string };
    interviewIds.push(interview.id);

    const webhook = await completeInterview(interview.id, participant.transcript);
    check(
      `${participant.firstName}: end-of-call-report accepted`,
      webhook.status === 200,
      webhook.body,
    );
  }

  console.log("\nGenerate study report (real LLM call)");
  const report = await postJson(`/api/studies/${study.id}/report`, {});
  check("returns 201", report.status === 201, report.body);
  const reportBody = report.body as {
    version: number;
    themes: { representativeQuotes: string[] }[];
  };
  check("version is 1", reportBody.version === 1, reportBody.version);
  check("has at least one theme", reportBody.themes.length > 0, reportBody.themes);
  // Which participant(s) a theme clusters together is a real, non-deterministic
  // LLM judgment call — don't assert on it. Just confirm both participants'
  // transcripts actually got fed in and surfaced somewhere in the output.
  const allQuotes = reportBody.themes.flatMap((t) => t.representativeQuotes).join(" ");
  for (const participant of participants) {
    const participantQuotes = participant.transcript
      .filter((m) => m.role === "user")
      .map((m) => m.message);
    check(
      `${participant.firstName}'s transcript is represented in the report`,
      participantQuotes.some((q) => allQuotes.includes(q)),
      allQuotes,
    );
  }

  console.log("\nGenerate again — version increments, doesn't overwrite");
  const secondReport = await postJson(`/api/studies/${study.id}/report`, {});
  check("returns 201", secondReport.status === 201, secondReport.body);
  check(
    "version is 2",
    (secondReport.body as { version: number }).version === 2,
    (secondReport.body as { version: number }).version,
  );

  console.log("\n404 for an unknown study id");
  const missing = await postJson("/api/studies/00000000-0000-4000-8000-000000000000/report", {});
  check("returns 404", missing.status === 404, missing.body);

  console.log("\n422 for a study with no completed interviews");
  const empty = await postJson("/api/studies", { targetProfile: sampleProfile });
  const emptyStudy = empty.body as { id: string };
  const noEligible = await postJson(`/api/studies/${emptyStudy.id}/report`, {});
  check("returns 422", noEligible.status === 422, noEligible.body);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Script failed to run — is `npm run dev` up at", BASE_URL, "?\n", err);
  process.exit(1);
});
