/**
 * Live eval-style test: does a researchTopic on the study context actually
 * change the real interviewer's behavior, not just the prompt text? Only
 * runs with a real API key set (same skip pattern as
 * claude-sonnet-4-6-adapter.integration.test.ts) — it's slow, costs real
 * API usage, and the model's exact wording is non-deterministic, so it's
 * excluded from the default `npm test` run.
 *
 * Drives a scripted "fake participant" through a few turns designed to
 * plausibly surface the researchTopic's example focus areas (AI tool usage,
 * an abandoned attempt, anxiety about being second-guessed), then asserts
 * the interviewer's questions actually followed up on that focus rather
 * than staying purely on generic day-to-day workflow.
 */
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeSonnet46Adapter } from "../claude-sonnet-4-6-adapter";
import { hasAnthropicTestEnv } from "./test-env";
import { InterviewAgent } from "@/interview-agent/interview-agent";
import type { InterviewPromptContext } from "@/interview-agent/system-prompt";
import type { InterviewTurn } from "../types";

const RESEARCH_TOPIC =
  "How AI actually shows up in a PM's day — dig into where they use AI tools, where they've tried and abandoned it, and where they're anxious about it (job security, being second-guessed by AI-generated specs, etc.)";

const context: InterviewPromptContext = {
  participantFirstName: "Jordan",
  participantRoleDescription: null,
  targetProfile: {
    industry: "SaaS",
    yearsOfExperience: "5-10 years",
    jobTitle: "Product Manager",
    seniority: "Senior",
    responsibility: "Owns the core platform roadmap",
  },
  researchTopic: RESEARCH_TOPIC,
  customPrompt: null,
};

// Fixed replies played back regardless of the interviewer's exact wording —
// each is written to plausibly surface one of the topic's focus areas
// whenever the interviewer asks a next question, so the eval isn't
// dependent on the interviewer phrasing things a specific way.
const SCRIPTED_PARTICIPANT_REPLIES = [
  "I mostly spend my day writing specs, running standups, and triaging bugs with engineering.",
  "I've started using an AI tool to draft first-pass specs, it saves me some time.",
  "I actually tried using it for writing my quarterly roadmap doc a while back, but I gave up on that — it kept missing context only I had, so I went back to doing it by hand.",
  "Honestly, sometimes I worry engineers trust the AI-generated spec more than they'd trust me if I pushed back on something, and I wonder if that undermines my judgment calls.",
];

describe.skipIf(!hasAnthropicTestEnv)("researchTopic steering (integration)", () => {
  it("probes into the stated research focus once the conversation surfaces it", async () => {
    const adapter = new ClaudeSonnet46Adapter(new Anthropic());
    const agent = new InterviewAgent(adapter);
    const interviewStartedAt = new Date();
    const history: InterviewTurn[] = [];

    for (const reply of SCRIPTED_PARTICIPANT_REPLIES) {
      const turn = await agent.generateNextTurn({
        context,
        conversationHistory: history,
        interviewStartedAt,
      });
      history.push({ speaker: "interviewer", text: turn.utterance });
      if (turn.isInterviewOver) break;
      history.push({ speaker: "participant", text: reply });
    }

    const interviewerText = history
      .filter((t) => t.speaker === "interviewer")
      .map((t) => t.text)
      .join(" ")
      .toLowerCase();

    // Coarse behavioral signal: the interviewer's questions should engage
    // with at least one of the topic's stated focus areas (tool usage,
    // abandonment, or anxiety/trust) once the participant raises it —
    // not just generic workflow follow-ups.
    const mentionsFocusArea =
      /\bai\b|artificial intelligence|tool/.test(interviewerText) ||
      /abandon|gave up|went back|stopped using/.test(interviewerText) ||
      /worry|worried|anxious|trust|second-guess|job security/.test(interviewerText);

    expect(mentionsFocusArea).toBe(true);
  }, 30000);
});
