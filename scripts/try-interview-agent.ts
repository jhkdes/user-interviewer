/**
 * Manual, interactive tryout of the real InterviewAgent + Claude — for
 * judging interviewing *quality* (Mom Test style, depth, tone, when it
 * wraps up), which the FakeLLMProvider-driven unit tests can't verify.
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
    "Engineering manager overseeing a 12-person platform team at a mid-size fintech company",
  targetProfile: {
    industry: "Fintech",
    yearsOfExperience: "5-10 years",
    jobTitle: "Engineering Manager",
    seniority: "Senior",
    responsibility: "Owns platform reliability and internal tooling",
  },
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY before running this script.");
    process.exit(1);
  }

  const agent = new InterviewAgent(new ClaudeSonnet46Adapter(new Anthropic()));
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
