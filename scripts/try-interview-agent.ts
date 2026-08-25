/**
 * Manual, interactive tryout of the real InterviewAgent + Claude — for
 * judging interviewing *quality* (Mom Test style, depth, tone, when it
 * wraps up), which the FakeLLMProvider-driven unit tests can't verify. Also
 * runs the real `generateSummary` call against the resulting transcript once
 * the interview ends, so the individual-summary extraction (including the
 * backfilled `roleDescription`, see #4) can be eyeballed too.
 *
 * Requires ANTHROPIC_API_KEY set. Run with: npm run try:interview-agent
 *
 * You play the participant: type replies at the "You:" prompt. The real
 * interviewer (Claude, via InterviewAgent) responds each turn. Type
 * "/quit" to stop early, or just let the agent end the interview itself.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ClaudeSonnet46Adapter } from "../src/llm/claude-sonnet-4-6-adapter";
import type { InterviewTurn } from "../src/llm/types";
import { InterviewAgent } from "../src/interview-agent/interview-agent";
import type { InterviewPromptContext } from "../src/interview-agent/system-prompt";

const context: InterviewPromptContext = {
  participantFirstName: "Jordan",
  participantRoleDescription:
    "Senior Product Manager owning the core platform roadmap at a mid-size SaaS company",
  targetProfile: {
    industry: "SaaS",
    yearsOfExperience: "5-10 years",
    jobTitle: "Product Manager",
    seniority: "Senior",
    responsibility: "Owns the core platform roadmap",
  },
  researchTopic:
    "How AI actually shows up in a PM's day — dig into where they use AI tools, where they've tried and abandoned it, and where they're anxious about it (job security, being second-guessed by AI-generated specs, etc.)",
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY before running this script.");
    process.exit(1);
  }

  const adapter = new ClaudeSonnet46Adapter(new Anthropic());
  const agent = new InterviewAgent(adapter);
  const rl = createInterface({ input: stdin, output: stdout });

  const conversationHistory: InterviewTurn[] = [];
  const interviewStartedAt = new Date();

  console.log(`--- Simulated interview with "${context.participantFirstName}" ---`);
  console.log(`(role: ${context.participantRoleDescription})`);
  console.log(`Type "/quit" at any "You:" prompt to stop early.\n`);

  try {
    for (;;) {
      const turn = await agent.generateNextTurn({
        context,
        conversationHistory,
        interviewStartedAt,
      });

      console.log(`\nInterviewer: ${turn.utterance}`);
      conversationHistory.push({ speaker: "interviewer", text: turn.utterance });

      if (turn.isInterviewOver) {
        console.log(`\n--- Interview ended (reason: ${turn.terminationReason}) ---`);
        break;
      }

      const reply = await rl.question("\nYou: ");
      if (reply.trim() === "/quit") {
        console.log("\n--- Stopped manually ---");
        break;
      }
      conversationHistory.push({ speaker: "participant", text: reply });
    }
  } finally {
    rl.close();
  }

  console.log("\n--- Full transcript ---");
  for (const turn of conversationHistory) {
    console.log(`${turn.speaker === "interviewer" ? "Interviewer" : "You"}: ${turn.text}`);
  }

  const hasParticipantReply = conversationHistory.some((turn) => turn.speaker === "participant");
  if (!hasParticipantReply) {
    console.log("\n(No participant replies — skipping summary generation.)");
    return;
  }

  console.log("\n--- Generating summary from this transcript... ---");
  const summary = await adapter.generateSummary({ transcript: conversationHistory });
  console.log("\n--- Summary ---");
  console.log("roleDescription:", summary.roleDescription);
  console.log("painPoints:", summary.painPoints);
  console.log("notableQuotes:", summary.notableQuotes);
  console.log("takeaways:", summary.takeaways);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
