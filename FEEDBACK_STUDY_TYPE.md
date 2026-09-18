# Design: a "feedback" study type (post-webinar feedback sessions)

Status: **design doc, not yet implemented.** Captures decisions made while
scoping this; implementation should follow the same clarify → plan →
approve flow used for the study-creation generalization work. See
`GLOSSARY.md` for the canonical terms (**Study Type**, **Discovery**,
**Feedback**, **Feedback Questions**) introduced alongside this doc.

## Context

Today every `Study` runs the same kind of interview — what this doc (and
the glossary) now calls a **Discovery** study: a ~15-minute, Mom-Test
style, open-ended interview (`buildInterviewSystemPrompt` in
`src/interview-agent/system-prompt.ts`) — broad-to-narrow exploration of a
participant's workflow, ending once the LLM judges "sufficient depth" has
been reached, per `src/interview-agent/termination.ts`.

The need: a **5-7 minute post-webinar Feedback session** — qualitatively
different from a Discovery interview. Several assumptions baked into the
current interview flow don't apply:

- **Duration**: 15 min vs. 5-7 min.
- **Style**: Mom-Test open-ended discovery vs. specific feedback about a
  session just attended.
- **Time pressure handling**: a 3-minutes-before-cap scripted "can you keep
  going?" check-in makes sense for 15 minutes; it would eat a huge fraction
  of a 5-minute call.
- **Ending logic**: depth-based self-assessment (`shouldEndInterview` once
  "enough" has been said) vs. working through a fixed, PM-defined list of
  Feedback Questions and stopping once they're covered.

**What must stay shared**: the voice pipeline (TTS/STT via Vapi/
ElevenLabs), transcription, the `Study`/`Interview` data model and
dashboard grouping, and the participant intake flow's mechanics (name/
email, consent, the live call itself, and the mobile-block gate).

## Decisions made

1. **Formal Study Type**, not configurable knobs. `Study` gains a
   `type: "discovery" | "feedback"` field, **immutable once the study is
   created** — the whole prompt/termination shape differs too much to
   safely switch later. Each type owns its own system-prompt template and
   its own timing rules in code — simpler to reason about than a matrix of
   independent settings, and a third type later is a clean addition rather
   than a new combination of flags. Existing studies default to
   `type: "discovery"` (backfilled by migration, same pattern as the
   target-profile generalization). The "New Study" wizard's first step is
   now choosing the type; it can't be edited afterward.

2. **No scripted time-check for Feedback studies.** Discovery studies keep
   their existing two-tier scripted check-in
   (`TIME_CHECK_UTTERANCE`/`SECOND_TIME_CHECK_UTTERANCE` in
   `interview-agent.ts`, driven by `SOFT_CAP_MS`/`EXTENDED_SOFT_CAP_MS`).
   Feedback studies skip this entirely — no injected "we're running low on
   time" line, no `Interview.extensionGranted` decision turn, no
   `timeCheckAskedAt`/`secondTimeCheckAskedAt`. Those fields/mechanisms
   stay Discovery-only.

3. **Duration is entirely a function of Study Type — not independently
   configurable per study.** A single hard cap, not a soft/extended
   two-tier system:
   - Base target: **5 minutes** — a *prompt-level* instruction ("aim to
     wrap up in about 5 minutes, once you've been through the feedback
     questions"), not a mechanical checkpoint.
   - Mechanical hard cap: **7 minutes** — enforced the same way
     `termination.ts`'s `checkTermination` enforces `HARD_CAP_MS` today
     (always wins, no exceptions), just a different constant for this
     type. No separate "soft cap" constant, no extension-granted state
     machine — the 5→7 minute range is entirely the model exercising
     judgment ("finish the question in progress, don't cut them off
     mid-thought") within one fixed ceiling, not a granted extension.
   - Discovery keeps its existing 15/25-minute numbers unchanged.

4. **Ending is fixed-question-set-driven, not open-ended depth
   self-assessment — and no minimum-turns floor.** A PM defines an ordered
   list of Feedback Questions for the study (new field, see below). The
   feedback system prompt instructs the interviewer to work through that
   list and set `shouldEndInterview: true` once they've all been asked and
   answered — reusing the exact same schema-enforced
   `shouldEndInterview`/`participantRequestedEnd` mechanism
   (`RESPONSE_CONTRACT`) as Discovery studies, just with completely
   different guidance on what "should end" means. `checkTermination`'s
   `MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END` depth-floor guard is
   **Discovery-only** — Feedback studies have no minimum-turns safety net;
   a fixed short question list is already naturally bounded.

5. **New structured field for the questions**, not reuse of `customPrompt`.
   `Study.feedbackQuestions: string[]` — an ordered list of plain-text
   questions/topics (not multiple-choice — this is what the interviewer
   asks the participant, unlike `preInterviewQuestions`, which is what the
   participant answers before the call). The list order is a PM-authored
   *priority* ordering, not a rigid script — see decision 10: the
   interviewer has latitude to split, reorder, skip, or rephrase entries
   based on time remaining and how the conversation is actually going. The
   feedback system-prompt template weaves these in automatically, handling
   tone/style/wrap-up boilerplate so the PM only writes the actual
   questions. `customPrompt` remains available as a full override for
   Feedback studies too, same precedence rule as today (when set, it
   replaces the generated feedback template entirely, and the
   `RESPONSE_CONTRACT` is still appended on top).

6. **No pre-interview screener for Feedback studies.** `preInterviewQuestions`
   (the AI-drafted, PM-edited multi-choice screener) is Discovery-only. A
   post-webinar feedback call should be frictionless — attendees are
   already known from webinar registration, so an extra questionnaire
   before the call adds friction for little benefit. The "New Study"
   wizard's "Generate questions" step doesn't apply to Feedback studies.

7. **Simplified intro screen for Feedback studies.** Today's intro screen
   (`intro-screen.tsx`) is discovery-interview-shaped: "How it works" with
   4 steps, a facts row, an FAQ link, consent copy sized for a 15-minute
   commitment. That's too wordy for a 5-minute feedback ask. Feedback
   studies get their **own, simpler intro screen component** reflecting
   the short window (e.g. "Quick 5-minute feedback on today's session" —
   exact copy TBD at implementation time), not a config-driven variant of
   the existing one. Which intro screen renders is driven by
   `study.type`, and its stated duration is tied to that type (not a
   separate field) — consistent with decision 3.

8. **Mobile block stays enabled for both types, unchanged rationale.** The
   mobile-blocked screen exists because a mobile browser can lose the
   active call when the phone's screen locks/sleeps — a real risk
   regardless of whether the call is 5 minutes or 15. Feedback studies
   keep the same hard mobile block as Discovery studies. (The screen's
   copy currently hardcodes "10–15 minute" — that needs to become
   type/duration-aware text, not removed.)

9. **Individual summaries stay for both types, but the extraction prompt
   differs by Study Type.** Discovery keeps today's shape — pain points,
   notable quotes, takeaways. Feedback studies get a different summary
   focused on **what the participant liked, what they disliked, and
   suggestions to improve** — a distinct extraction prompt (and likely a
   distinct output shape) from `generateSummary`/`Summary`. See open items
   below for the exact schema question.

10. **Question-design and interviewing-technique guidance is baked into
    the feedback system-prompt template itself**, not left to each PM to
    get right when authoring `feedbackQuestions`. Agreed practices (each
    maps to a concrete instruction in the drafted guidance block below):
    - **One idea per question.** A PM's list entry may itself be
      double-barreled (that's just how someone would naturally jot it
      down); the interviewer is instructed to notice this and split it
      into two separate asks, deciding on the fly which one (or both) fits
      the time remaining — this is the "dynamic, time-aware" reordering
      decision 5 refers to.
    - **Concrete before abstract.** Push for a specific moment/memory,
      not a vague "how was it overall" framing, which invites a polite
      non-answer.
    - **Experience before judgment.** Ask what happened before asking for
      a verdict — behavior first surfaces detail; opinion first surfaces
      only a rating with nothing behind it.
    - **No leading or double-barreled phrasing.** Neutral wording only —
      don't hint at the answer you want, don't smuggle a second question
      into one sentence (ties back to "one idea per question" above).
    - **Balance positive and negative.** Don't let the session become
      pure complaint-harvesting — explicitly cover both what worked and
      what didn't, even if the PM's list skews toward one.
    - **Always end with an open floor.** A final, unprompted "anything
      else on your mind?"-style question is *guaranteed*, asked after the
      PM's list is covered — not something the PM has to remember to add,
      and not something left to the LLM to remember either. Per the
      decision below, this is **deterministically scripted**, the same
      way `TIME_CHECK_UTTERANCE` is: covering the list alone never ends
      the call on its own; the interviewer's belief that it's covered the
      list instead triggers a scripted open-floor turn, and only the turn
      *after* the participant answers it is allowed to actually close.

    Whether this whole guidance block still applies under a `customPrompt`
    override was an open question — **resolved: no.** For consistency
    with how Discovery's "Style"/"Structure" sections work today, a
    `customPrompt` fully replaces this block too; only `RESPONSE_CONTRACT`
    (the output-schema contract, not interviewing style) is still appended
    on top, exactly like Discovery. A PM who writes a full custom prompt
    for a feedback study owns its interviewing technique entirely.

11. **The open-floor closer is deterministically scripted, not left to
    the LLM's judgment** — resolving the second open question, for
    consistency with how `TIME_CHECK_UTTERANCE`/`SECOND_TIME_CHECK_UTTERANCE`
    already work in `interview-agent.ts`. Mechanism (mirrors the existing
    two-stage scripted-turn pattern, just triggered by the model's own
    "I think I've covered the list" signal instead of elapsed time):
    - A new scripted line, e.g. `OPEN_FLOOR_UTTERANCE` — something like
      "Before we wrap up, is there anything else on your mind about
      today's session?"
    - On an ordinary feedback-type turn, once the model returns
      `shouldEndInterview: true` for the first time (its honest signal
      that it believes the list is covered) *and* the open-floor question
      hasn't been asked yet (detected the same way `wasUtteranceSpoken`
      scans the transcript for `TIME_CHECK_FRAGMENTS` today), the turn is
      intercepted: the model's proposed utterance is discarded and
      replaced with `OPEN_FLOOR_UTTERANCE` verbatim, `isInterviewOver` is
      forced to `false` for this turn, and a new `Interview.openFloorAskedAt`
      timestamp is persisted (mirrors `timeCheckAskedAt`).
    - The turn immediately after the participant answers it is a
      deterministic closing turn: the interviewer gives a brief warm
      close responding to whatever they just said, and
      `shouldEndInterview` is **forced `true` regardless of what the model
      returns** — never trusted, the same non-negotiable-close principle
      `finalizeTurn` already applies to Discovery's reactive turns.
    - Net effect: "list covered" signal → scripted open-floor question →
      participant's answer → guaranteed close, exactly one turn later.
      The existing 7-minute hard cap is still the outer bound regardless
      (e.g. if the model never signals coverage at all).

## Proposed shape (not yet built)

**Domain (`src/domain/study.ts`):**
```ts
export type StudyType = "discovery" | "feedback";

export interface Study {
  // ...existing fields...
  type: StudyType;
  /** Only meaningful when type === "feedback". Ordered list of plain-text
   *  feedback questions/topics the interviewer works through. */
  feedbackQuestions: string[];
}
```
`preInterviewQuestions` stays as-is but is simply never populated/shown for
`type === "feedback"` studies (empty array, screener step skipped in both
the creation wizard and the participant intake form).

**Termination (`src/interview-agent/termination.ts`):** new constants
alongside the existing Discovery ones —
`FEEDBACK_HARD_CAP_MINUTES = 5` (soft target, prompt-level only) and
`FEEDBACK_EXTENDED_HARD_CAP_MINUTES = 7` (the actual mechanical
`hardCapMs` passed into `checkTermination` for feedback-type interviews).
No feedback-specific soft-cap constant, and `checkTermination` skips the
`MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END` gate entirely for this type.

**System prompt:** a new, separate builder — e.g.
`buildFeedbackSystemPrompt(context)` in a new file (not a branch inside
`buildInterviewSystemPrompt`, since "the rest of prompt and interview
style" is meant to diverge completely) — sharing only `RESPONSE_CONTRACT`
and the `{{participant_name}}` interpolation helper. No Mom-Test style
section, no broad-to-narrow depth heuristic, no `researchTopic` handling
(not applicable to this type).

Structure: greet, reference the webinar (title/description), then work
adaptively through `feedbackQuestions` (not a rigid recite-in-order
script — see decision 10), then a guaranteed open-floor closer, then wrap
up — at the 7-minute cap if that comes first.

Draft of the question-design/interviewing-technique guidance block (the
feedback-type analog of Discovery's "Style"/"Interviewing technique"
sections), translating decision 10 into instructions:

```
## How to ask the feedback questions
You have a list of things to cover, but you are not reading a script —
treat the list as priorities, not a fixed order or fixed wording.

- If an item bundles two ideas together, split it into two separate
  questions and ask them one at a time — never force the participant to
  answer two things at once. Decide in the moment which of the two (or
  whether both) fits in the time you have left.
- Prefer asking about a specific moment or memory over a general
  impression — "what's one thing from today that stood out?" beats "how
  was it overall?" A vague question invites a vague, polite non-answer.
- Ask what happened before asking for a verdict. "Walk me through what
  happened when..." surfaces real detail; "did X work well?" only
  surfaces a yes/no with nothing behind it.
- Keep every question neutral. Never phrase a question in a way that
  hints at the answer you want, and never combine a leading remark with
  a question in the same breath.
- Make sure you cover both what worked and what didn't over the course
  of the conversation — don't let it drift into only collecting
  complaints, and don't let politeness mean you only hear positives
  either.
- Once you've worked through what's worth covering from your list,
  always ask one final open-ended question before closing — something
  like "is there anything else on your mind about today's session?" —
  before wrapping up. Do not set shouldEndInterview to true until this
  final question has been asked and answered; it's often where the most
  useful, unprompted feedback comes from.
```

Per decision 10, this block is dropped entirely when `customPrompt` is
set — only `RESPONSE_CONTRACT` persists, same as Discovery.

**`InterviewAgent`** (`src/interview-agent/interview-agent.ts`): needs to
know the study type to decide (a) whether to run the Discovery time-check
scripted injections at all, (b) whether to run the new feedback-type
open-floor scripted injection (decision 11) instead, and (c) which
system-prompt builder and which hard-cap constant to use. This means
`InterviewAgentTurnInput`/the context threaded from
`src/voice-session/generate-turn.ts` needs to carry `study.type` (and
`feedbackQuestions` when relevant) end to end, and `Interview` needs a new
`openFloorAskedAt: Date | null` field alongside the existing
`timeCheckAskedAt`/`secondTimeCheckAskedAt`.

**Individual summaries:** `generateSummary`'s system prompt and output
schema need a Feedback variant — extracting `liked`/`disliked`/
`suggestions` instead of `painPoints`/`notableQuotes`/`takeaways`. Exact
domain/schema shape (a discriminated `Summary` union vs. one shape with
different-but-parallel field sets) is an open item below, since it touches
`domain/summary.ts`, `llm/schemas.ts`, `llm/types.ts`, the Claude adapter,
`notification-service`'s summary email rendering, and
`study-report-service`'s cross-participant aggregation.

**Dashboard:** the "New Study" wizard's first step is a type picker
(Discovery vs Feedback), branching the rest of the form — Discovery keeps
today's flow (title/description → AI-drafted screener questions);
Feedback shows title/description + an ordered feedback-questions editor
(add/remove/reorder plain-text entries, no AI draft step, no screener).
The post-creation "edit" page needs the equivalent branch (and, per
decision 1, never shows a way to change `type` itself).

**Participant-facing UI:** a new, simpler intro screen component for
`type === "feedback"`, selected by `study.type` in
`src/app/interview/[linkToken]/page.tsx`. The mobile-block screen is
reused as-is (decision 8) but its copy needs to stop hardcoding "10–15
minute" and instead reflect the actual type/duration.

## Explicitly open / not yet decided

- Exact copy for the new simplified Feedback intro screen.
- Exact wording/UX for the "New Study" wizard's type selector and the
  feedback-questions editor (add/remove/reorder UI).
- Exact domain/schema shape for Feedback-type individual summaries
  (liked/disliked/suggestions) — new fields on the existing `Summary`
  type, a discriminated union, or a separate type entirely — and how
  `study-report-service`'s cross-participant aggregation handles a study
  whose interviews carry a different summary shape.
- The mobile-block screen's copy needs to become type/duration-aware
  (decision 8) — exact wording TBD.
- The pre-existing "15-minute"/"10–15 minute" hardcoded-literal bugs in
  `system-prompt.ts:202`, `intro-screen.tsx`, and `mobile-blocked-screen.tsx`
  (see conversation history) should be fixed as part of this work
  regardless, since Discovery's own copy is already wrong today.
