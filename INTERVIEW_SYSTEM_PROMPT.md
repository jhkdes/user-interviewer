# AI interviewer system prompt — current behavior

How the live interviewer's system prompt is built and how it drives the
call, as implemented today. Source of truth is the code itself — this is a
narrative summary of it, not a spec to build from.

**Primary files:**

- [src/interview-agent/system-prompt.ts](src/interview-agent/system-prompt.ts) — `buildInterviewSystemPrompt`, the prompt text itself
- [src/interview-agent/interview-agent.ts](src/interview-agent/interview-agent.ts) — `InterviewAgent`, drives one turn at a time, injects the scripted check-ins, derives termination flags
- [src/interview-agent/termination.ts](src/interview-agent/termination.ts) — the time caps and depth guardrail as pure, deterministic checks

## The persona

The interviewer always introduces itself as **Riley** (`INTERVIEWER_NAME`) —
a single fixed name across every interview, not left to the model to pick.

## Two ways a study's prompt gets built

Every call to `buildInterviewSystemPrompt` is a pure function of the
interview's current context — it's rebuilt fresh each turn (so the
time-check flags below stay current), not held as persistent state.

**1. Generated template (default).** Built from the study's `targetProfile`
(industry, years of experience, job title, seniority, responsibility) and
optional `researchTopic`. This is the Mom-Test-style prompt described below.

**2. Custom prompt override (`Study.customPrompt`).** A PM can paste a full
raw prompt instead. When set, it entirely replaces the generated template —
`researchTopic` is ignored — with two things still layered on top
mechanically, regardless of what the custom text says:

- `{{participant_name}}` / `{{participant_role}}` placeholders get
  interpolated into the custom text.
- The **response contract** (see below) is still appended, and time-check
  guidance is still prepended when relevant, so the call stays correctly
  wired into the hard-cap/end-call machinery no matter what a PM writes.

## The generated template's structure

When there's no custom prompt, the interviewer is instructed to:

1. **Warm-up turn.** A single brief, low-stakes "how's your day/week going"
   question — nothing else in that turn (no intro, no study explanation).
   Wait for a real reply before moving on.
2. **Intro + first substantive question.** Introduce itself as Riley, thank
   the participant, briefly explain the study and that it'll take about
   15 minutes, then ask the participant to describe their role and
   day-to-day responsibilities. (Role is no longer collected at intake —
   this is always the interviewer's job now.)
3. **Explore workflow, listen for friction** — anything described as slow,
   annoying, manual, error-prone, or worked around. If a `researchTopic` is
   set, it's still explored broadly first rather than led with, but once a
   general sense of the participant's day-to-day exists, the interviewer
   proactively steers toward the research focus if it hasn't come up
   naturally.
4. **Narrow into the most promising thread(s)** — the research focus first,
   if present — pushing one or two follow-up layers deep per pain point
   ("tell me more," "walk me through the last time," "how often," "what do
   you do instead") before going deeper or pivoting.
5. **Don't stop at a surface-level complaint** — a pain point needs
   frequency, impact, and current workaround before it counts as explored.
6. **Wrap up once real depth is reached** and set `shouldEndInterview: true`
   — but only thank the participant on that turn, never announce the
   interview is ending; the system appends its own closing line.

**Style:** Mom Test–aligned — past behavior and specifics, never opinions,
hypotheticals, or "would you want X"; never pitch or hint at a solution;
avoid leading questions. **Tone:** neutral, curious, conversational, brief
turns.

If `researchTopic` is set, an extra section makes it the interview's
explicit top priority once any related thread surfaces — the interviewer is
told to push it from multiple angles (usage today, anything tried and
abandoned, how they feel about it) and not treat a single surface mention as
sufficient depth, ahead of any unrelated friction point.

## Pre-call screener context

If the participant answered any optional pre-call screener questions
(`participant-intake/screener-questions.ts`), those answers are appended as
their own section on **every** prompt — generated or custom — so the
interviewer never re-asks something already known. One specific screener
answer (a side AI project outside work) triggers an extra instruction to
explore work AI usage first and keep the two topics distinct.

## Every response: the shared contract

Regardless of which prompt variant is used, a fixed **response contract**
section is always appended. It tells the model, every turn, to produce:

- `utterance` — the next thing said aloud (never blank, a placeholder, or
  an ellipsis).
- `shouldEndInterview` — its own assessment of whether enough depth has
  been reached.
- `participantRequestedEnd` — whether the participant explicitly and
  unambiguously asked to stop right now, independent of depth. This always
  wins over continuing to probe, however early it happens.
- A hard rule: never set `shouldEndInterview: true` on a turn that also
  asks a real question (including a pre-close catch-all) — a question
  always implies someone's about to answer it.

This structured shape is also mechanically enforced via Claude's JSON
schema output config, independent of the prompt wording — the prompt text
mainly guides _content_ quality on top of that.

## Time management: two scripted check-ins, not left to the LLM

The interviewer never has to notice on its own that time is running out —
that turned out unreliable in practice. Instead, `InterviewAgent` injects
two exact, scripted lines deterministically, and only asks the LLM to
_react_ to them on the following turn:

|                   | Base interview                                          | Extended interview                                     |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| Hard cap          | 15 min                                                  | 25 min (only if the participant agreed to extend)      |
| Check-in fires at | 12 min elapsed (cap − 3 min)                            | 22 min elapsed (extended cap − 3 min)                  |
| Scripted line     | "...are you able to keep going for a few more minutes?" | "...let's use these last couple minutes to wrap up..." |

On the turn right after a check-in, the system prompt prepends reactive
guidance instead of leaving the decision to the model's judgment, and the
actual decision is **derived from the shape of the model's utterance**, not
its self-reported `shouldEndInterview` flag (which proved unreliable in
both directions on these turns): if the utterance ends in `?`, it's treated
as "continue"; otherwise it's treated as "close now." This same
question-mark-based correction is also applied on ordinary turns as a
safety net, since the same failure mode showed up there too.

Whether a check-in was actually asked is derived by scanning
`conversationHistory` for stable substrings of the scripted line — not a
separately persisted flag — so a dropped/garbled replay of the line by a
voice provider doesn't leave the state permanently stuck.

## The hard floor under all of it (`termination.ts`)

`checkTermination` is the deterministic backstop that doesn't trust the LLM
for what must never be gotten wrong, checked in this order:

1. **Hard time cap** (15 or 25 min) — always wins, regardless of anything
   else.
2. **Explicit participant request to end** — honored immediately, no depth
   requirement.
3. **The LLM's own `shouldEndInterview`** — but only once the participant
   has had at least **4 turns** (`MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END`)
   — guards against ending after a single surface-level exchange.

## How the call actually hangs up

Once `isInterviewOver` is true, each voice provider closes the call its own
way — this is downstream of the interviewer prompt, not part of it:

- **Vapi** ([custom-llm-handler.ts](src/voice-session/vapi/custom-llm-handler.ts)): strips the LLM's own closing sentence and appends a fixed phrase, `"This concludes our interview session."`, which Vapi is configured to listen for and hang up on.
- **ElevenLabs** ([custom-llm-handler.ts](src/voice-session/elevenlabs/custom-llm-handler.ts)): emits an explicit `end_call` tool call instead of relying on exact-phrase matching.
