/**
 * Simulates the job-search interview end to end: the real InterviewAgent (real
 * prompt from JOB_SEARCH_INTERVIEWER_PROMPT.md, real screener-answer context,
 * real time-check and termination rules) talks to an LLM playing a persona from
 * scripts/job-search-personas.json. Time is simulated from word counts, so the
 * soft-cap check-in and hard cap fire as they would in a live voice call.
 *
 * Outputs a transcript (markdown + JSON) per persona and prints deterministic
 * checks plus an LLM judgment of whether the six priority evidence items were
 * covered. Does not touch the database.
 *
 * Costs real Anthropic API calls (about 40 per persona). Requires
 * ANTHROPIC_API_KEY. Run with:
 *   npm run simulate:job-search -- --persona=selective-networker
 *   npm run simulate:job-search -- --persona=all
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { InterviewAgent } from "../src/interview-agent/interview-agent";
import type { InterviewPromptContext } from "../src/interview-agent/system-prompt";
import {
  runInterviewChecks,
  estimateSpokenSeconds,
} from "../src/job-search-study/interview-checks";
import { loadJobSearchInterviewerPrompt } from "../src/job-search-study/interviewer-prompt";
import {
  JOB_SEARCH_STUDY_DESCRIPTION,
  JOB_SEARCH_STUDY_TITLE,
} from "../src/job-search-study/study-config";
import { ClaudeSonnet46Adapter } from "../src/llm/claude-sonnet-4-6-adapter";
import type { InterviewTurn } from "../src/llm/types";

const SIM_MODEL = process.env.SIM_PARTICIPANT_MODEL ?? "claude-sonnet-5";
const JUDGE_MODEL = process.env.SIM_JUDGE_MODEL ?? "claude-sonnet-5";
const MAX_INTERVIEWER_TURNS = 60;
/** Added to each turn on top of speaking time: latency, thinking, turn-taking. */
const INTERVIEWER_OVERHEAD_SECONDS = 2;
const PARTICIPANT_OVERHEAD_SECONDS = 3;

interface Persona {
  id: string;
  firstName: string;
  summary: string;
  style: string;
  timeCheckBehavior: "extend" | "decline";
  screenerAnswers: Record<string, string | string[]>;
  background: string;
  extraFacts?: string;
}

const PRIORITY_ITEMS = [
  "match_rate: a rough number for how many of their recent (about 20) applications matched their target",
  "go_no_go: how they decide whether to apply, including one concrete role they passed on (or an answer about whether they usually pass)",
  "case_for_you: the reasons they gave for why a hiring team should interview them, and how those show up in the application",
  "typical_and_time: whether the application they described is typical, and roughly how long it took",
  "sources_and_effort: where recruiter conversations or interviews have come from (counts or proportions) AND where their search time goes",
  "what_was_different: what was different about the opportunity that led somewhere (or got furthest) compared with how they usually apply",
];

function parseArgs(): { personaIds: string[]; outDir: string } {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, "").split("=");
      return [key, rest.join("=")];
    }),
  );
  return {
    personaIds: (args["persona"] ?? "selective-networker").split(","),
    outDir: args["out"] ?? "simulation-output",
  };
}

function loadPersonas(): Persona[] {
  const file = path.resolve(process.cwd(), "scripts/job-search-personas.json");
  return JSON.parse(readFileSync(file, "utf-8")) as Persona[];
}

function personaSystemPrompt(persona: Persona): string {
  const timeCheck =
    persona.timeCheckBehavior === "extend"
      ? "If the interviewer says you are running low on time and asks whether you can keep going a few more minutes, say yes."
      : "If the interviewer says you are running low on time and asks whether you can keep going a few more minutes, say no: you are sorry, but you have to go very soon and cannot keep talking.";

  return `You are role-playing a job seeker named ${persona.firstName} in a spoken research interview about how they search for jobs. Stay fully in character. Never mention being an AI, a simulation, or a persona.

## Who you are
${persona.background}
${persona.extraFacts ? `\n${persona.extraFacts}\n` : ""}
## How you talk
${persona.style}
- Speak the way people talk out loud: natural, no bullet points, no markdown, no headers.
- Answer only what you are asked. Do not volunteer everything you know; let the interviewer ask follow-ups.
- Use only facts consistent with your background. If asked about something not covered, give a plausible answer that fits your situation, or say you are not sure.
- ${timeCheck}
- Do not try to wrap up the interview yourself.`;
}

async function simulateParticipant(
  client: Anthropic,
  persona: Persona,
  history: InterviewTurn[],
): Promise<string> {
  // The interviewer's lines are the "user" side of this conversation; the persona is the assistant.
  const messages = history.map((turn) => ({
    role: turn.speaker === "interviewer" ? ("user" as const) : ("assistant" as const),
    content: turn.text,
  }));

  const response = await client.messages.create({
    model: SIM_MODEL,
    max_tokens: 500,
    system: personaSystemPrompt(persona),
    messages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) throw new Error("Participant simulator returned no text");
  return text;
}

interface CoverageResult {
  [item: string]: { status: "covered" | "partial" | "missing"; evidence: string };
}

async function judgeCoverage(client: Anthropic, history: InterviewTurn[]): Promise<CoverageResult> {
  const transcript = history
    .map(
      (turn) => `${turn.speaker === "interviewer" ? "Interviewer" : "Participant"}: ${turn.text}`,
    )
    .join("\n");

  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Below is a transcript of a job-search research interview. For each evidence item, decide whether the participant provided it concretely ("covered"), only vaguely or incompletely ("partial"), or not at all ("missing"). Quote or briefly paraphrase the evidence in one short sentence.

Evidence items:
${PRIORITY_ITEMS.map((item, index) => `${index + 1}. ${item}`).join("\n")}

Respond with ONLY a JSON object keyed by the item name before the colon (match_rate, go_no_go, case_for_you, typical_and_time, sources_and_effort, what_was_different), each value shaped like {"status": "covered" | "partial" | "missing", "evidence": "..."}.

Transcript:
${transcript}`,
      },
    ],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json) as CoverageResult;
}

async function runPersona(
  client: Anthropic,
  agent: InterviewAgent,
  persona: Persona,
  outDir: string,
) {
  const context: Omit<InterviewPromptContext, "isDecisionTurn" | "isFinalWrapTurn"> = {
    participantFirstName: persona.firstName,
    participantRoleDescription: null,
    studyTitle: JOB_SEARCH_STUDY_TITLE,
    studyDescription: JOB_SEARCH_STUDY_DESCRIPTION,
    researchTopic: null,
    customPrompt: loadJobSearchInterviewerPrompt(),
    screenerAnswers: persona.screenerAnswers,
  };

  const history: InterviewTurn[] = [];
  const interviewStartedAt = new Date("2026-01-01T12:00:00Z");
  let elapsedSeconds = 0;
  let extensionGranted: boolean | null = null;
  let endedReason: string | null = null;

  for (let i = 0; i < MAX_INTERVIEWER_TURNS; i++) {
    const now = new Date(interviewStartedAt.getTime() + elapsedSeconds * 1000);
    const turn = await agent.generateNextTurn({
      context,
      conversationHistory: history,
      interviewStartedAt,
      extensionGranted,
      now,
    });
    if (turn.extensionDecision !== undefined) extensionGranted = turn.extensionDecision;

    history.push({ speaker: "interviewer", text: turn.utterance });
    elapsedSeconds += estimateSpokenSeconds(turn.utterance) + INTERVIEWER_OVERHEAD_SECONDS;

    if (turn.isInterviewOver) {
      endedReason = turn.terminationReason;
      break;
    }

    const reply = await simulateParticipant(client, persona, history);
    history.push({ speaker: "participant", text: reply });
    elapsedSeconds += estimateSpokenSeconds(reply) + PARTICIPANT_OVERHEAD_SECONDS;
  }

  const checks = runInterviewChecks(history, elapsedSeconds);
  const coverage = await judgeCoverage(client, history);

  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(outDir, `${persona.id}-${stamp}`);

  writeFileSync(
    `${base}.json`,
    JSON.stringify(
      { persona: persona.id, endedReason, checks, coverage, transcript: history },
      null,
      2,
    ),
  );
  writeFileSync(
    `${base}.md`,
    [
      `# Simulated interview: ${persona.id}`,
      "",
      `${persona.summary}`,
      "",
      `Ended: ${endedReason ?? "max turns reached"}, about ${checks.estimatedMinutes} minutes`,
      "",
      ...history.map(
        (turn) =>
          `**${turn.speaker === "interviewer" ? "Riley" : persona.firstName}:** ${turn.text}\n`,
      ),
    ].join("\n"),
  );

  console.log(`\n=== ${persona.id} ===`);
  console.log(
    `ended: ${endedReason ?? "max turns"} | ~${checks.estimatedMinutes} min | ${checks.interviewerTurns} interviewer turns`,
  );
  console.log(`closes with statement: ${checks.closesWithStatement}`);
  console.log(
    `report priority: ${
      checks.reportPriority
        ? `asked at turn ${checks.reportPriority.turnIndex}, answered: ${checks.reportPriority.answered}`
        : "NOT ASKED"
    }`,
  );
  console.log(`posting age asked: ${checks.postingAgeAsked}`);
  console.log(`coaching/scoring phrases: ${checks.coachingViolations.length}`);
  console.log(`evaluative acknowledgments: ${checks.evaluativeAcknowledgments.length}`);
  console.log(
    `screener questions re-asked: ${checks.screenerReasks.map((r) => r.screenerId).join(", ") || "none"}`,
  );
  for (const [item, result] of Object.entries(coverage)) {
    console.log(`  ${result.status.padEnd(8)} ${item}`);
  }
  console.log(`saved: ${base}.md`);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY (e.g. run via `npm run simulate:job-search`).");
    process.exit(1);
  }

  const { personaIds, outDir } = parseArgs();
  const personas = loadPersonas();
  const selected = personaIds.includes("all")
    ? personas
    : personaIds.map((id) => {
        const persona = personas.find((candidate) => candidate.id === id);
        if (!persona) {
          console.error(
            `Unknown persona "${id}". Available: ${personas.map((p) => p.id).join(", ")}`,
          );
          process.exit(1);
        }
        return persona;
      });

  const client = new Anthropic();
  const agent = new InterviewAgent(new ClaudeSonnet46Adapter(client));

  for (const persona of selected) {
    await runPersona(client, agent, persona, outDir);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
