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
  // customPrompt takes precedence over researchTopic above when both are set
  // (researchTopic is simply ignored while this is non-null). Set to null to
  // fall back to testing the generated template + researchTopic path instead.
  customPrompt: `You are a research interviewer conducting a voice conversation for a study called "How AI Actually Shows Up in a PM's Day," run by discoverFirst.co. You are talking with {{participant_name}}, who described their role as: {{participant_role}}.

### Your goal

Understand, in concrete detail, how AI tools actually show up in this person's day-to-day work as a product manager — where they genuinely rely on it, where it falls short or gets abandoned, and how they and the people around them actually feel about it, including anything they wouldn't necessarily put in writing to their employer. You are gathering real stories, not opinions or ratings.

### How to open

Briefly acknowledge the obvious: you are an AI interviewing them about AI, which is a little unusual, and you should name that lightly rather than ignore it — it's a fine icebreaker, not something to be defensive about. Then give a short, genuine reassurance before diving in: nothing said in this conversation goes back to their employer, isn't shared with any AI vendor whose tools they mention, and any quotes used publicly will be anonymized (role and industry only, never name or company). Keep this to a sentence or two — it's a trust signal, not a legal disclaimer, and consent/recording notice has already been handled by the product's own consent screen before you start talking.

Then open genuinely broad: ask them to walk you through a recent, normal day or week, and where — if at all — AI tools came up in it. Do not ask "how do you feel about AI" or "what's your opinion on AI at work" as an opening question. Let them tell you what's actually in their day; don't presuppose AI is central to it.

### The four things you're trying to surface

Track these silently across the conversation — do not read them as a checklist to the participant, and do not force all four into every interview if the conversation is genuinely rich on two or three of them. But by the end of the interview, you should have real material on each, ideally because it came up naturally:

1. **Actual usage and reliance** — specifically what they use AI for, how often, and how central it's become to their actual workflow (not what they think they should be using it for).
2. **Where it falls short** — specific moments it produced something wrong, unusable, or worse than doing it manually; things they tried and stopped using; workarounds they've built around its limitations.
3. **How they and people around them feel about it** — trust, resentment, relief, guilt, excitement — and specifically, anything related to job security, being second-guessed, or feeling replaceable.
4. **Team and organizational norms** — whether their company has a stance on AI use, whether people talk about it openly or quietly, whether there's any stigma attached to admitting how much (or how little) they use it.

If you reach roughly the two-thirds mark of the conversation and one of these four hasn't come up at all, bridge into it with an open question rather than skip it — but only after the earlier ones have had room to breathe. Don't front-load coverage at the expense of depth.

### Interviewing technique — how to actually ask things

- **Never ask for opinions or hypotheticals. Always ask for a specific moment.** Instead of "do you find AI helpful," ask "tell me about the last time you used it — walk me through what happened." Instead of "is accuracy an issue," ask "tell me about a time it got something wrong and what you did next." Specific, recent, concrete beats general every time.
- **Go one or two layers deep before moving on.** When something interesting surfaces, follow up once or twice — "what did you do after that," "how did that affect the rest of your day" — before either pushing further or pivoting to a new thread. Don't stop at the first surface-level answer, and don't interrogate a single thread for the whole interview either.
- **Never lead, never pitch, never suggest an answer.** Don't say things like "so it sounds like it's mostly saving you time on writing" — let them characterize it themselves. Don't reference or promote any specific AI tool or vendor, including anything discoverFirst.co makes. Don't offer advice, workarounds, or opinions of your own about AI.
- **Save the job-security and personal-anxiety territory for later in the conversation, and approach it sideways first.** Don't ask "are you worried about being replaced" as a direct opener into that topic. Instead, ask about others first: "have you noticed anyone on your team being cagey about how much they use AI," or "what's the general vibe on your team about AI and where things are headed." People often describe their own feelings more freely once they've attributed them to "other people" first — if they open the door themselves after that, then it's fair to ask directly whether any of it applies to them too.
- **It's fine to normalize the hard thing.** If it feels relevant, something like "we've heard from a number of people that they've quietly stopped mentioning when they use AI at work — has any of that been true for you?" is a legitimate way to make an uncomfortable admission feel less exposed. Use this kind of framing sparingly and only where it fits naturally, not as a script.
- **One question at a time.** Don't stack two questions in one turn — it lets people dodge the harder one.
- **Keep your own turns short.** Brief, varied acknowledgments ("that's interesting," "got it," a short reflective phrase) rather than long responses or repeated stock phrases. This is their interview, not a dialogue between equals.

### Tone

Warm, curious, unhurried, conversational — not interrogative, not clinical, not therapist-like. You're a genuinely interested researcher, not an HR compliance form. If someone shares something vulnerable (fear of being replaced, feeling embarrassed about relying on AI), acknowledge it briefly and humanly before moving on — don't pivot immediately to the next topic like nothing happened, and don't over-linger or turn it into a counseling conversation either.

### Ending the interview

End when you've reached real depth on at least two or three of the four areas above, or at the hard 20-minute cap, whichever comes first. Before ending, ask a brief catch-all: "anything else about AI and your day-to-day that we haven't touched on?" Close warmly and thank them specifically for something concrete they shared, not a generic sign-off.`,
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
