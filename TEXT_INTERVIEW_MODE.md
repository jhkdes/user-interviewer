# Text interview mode — plan

## Goal

Let a participant in a **feedback** study take the interview by typing in a chat window instead of speaking. The AI interviewer's questions stream in; the participant types replies. Everything downstream (agent, prompts, transcript, summary, email, webhook, exports) is reused unchanged.

**Discovery studies stay voice-only.** Nothing about the discovery flow changes: no mode-select step, no countdown, no typing option, no restart link. This is enforced on the server as well as hidden in the UI.

**Status:** merged to `main` and deployed to Production (PR #40) with the feature **off**. To turn it on, follow [Rollout and enabling](#rollout-and-enabling).

## Decisions (agreed)

| Topic                               | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which studies                       | Feedback studies only (`study.type === 'feedback'`). Discovery studies are voice-only. The server rejects text-mode routes for discovery studies.                                                                                                                                                                                                                                                                                                                    |
| Who picks the mode                  | For feedback studies, the participant, per interview. No study-level setting.                                                                                                                                                                                                                                                                                                                                                                                        |
| When                                | After intake. A 10-second countdown starts; voice is the default.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Countdown UI                        | Prominent "Start now" button (voice). Discreet "Switch to typing" link. At 0, voice starts.                                                                                                                                                                                                                                                                                                                                                                          |
| Mic denied / fails                  | Error with retry, plus "Can't use voice? Restart with a typing interview".                                                                                                                                                                                                                                                                                                                                                                                           |
| Switch to typing after voice starts | "Can't use voice? Restart with a typing interview" is offered for the first 30 seconds of the voice call. Switching discards the voice segment and starts a fresh text interview with a new greeting.                                                                                                                                                                                                                                                                |
| After the switch                    | `startedAt` resets, so caps measure the text interview. The voice recording is not shown.                                                                                                                                                                                                                                                                                                                                                                            |
| AI turn display                     | Streamed token by token.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Pipeline                            | Reuse `FeedbackAgent`, the study's feedback questions, `TranscriptEntry`, summary, email, completion webhook. `InterviewAgent` (discovery) is not touched.                                                                                                                                                                                                                                                                                                           |
| Prompt                              | A text-specific variant of the feedback prompt (new `channel: 'voice' \| 'text'` context field). Voice prompts stay byte-for-byte unchanged. Text messages are short, easy to read, and easy to answer; no small talk. See Prompt tuning.                                                                                                                                                                                                                            |
| Time cap                            | A single hard cap with no extension, checked only when a turn is generated. **Typed interviews get 15 minutes** (`FEEDBACK_TEXT_HARD_CAP_MS`), because participants compose answers more carefully and multitask; spoken feedback interviews keep 7 minutes (`FEEDBACK_HARD_CAP_MS`). In text mode, the cap-ending reply gets a fixed closing line appended so the end is not abrupt. See "Time cap in text mode".                                                   |
| Persistence                         | Each message is inserted live into an append-only `interview_messages` table (with timestamp, ordering by `seq`, idempotency by client message id). The `transcript` column is filled from it at completion.                                                                                                                                                                                                                                                         |
| Resume                              | An in-progress text interview survives a refresh or closing and reopening the tab in the same browser. The interview id is saved in `localStorage` when the chat starts; on load the app asks the server for its state and goes straight back to the chat. Voice interviews and the pre-start countdown are not resumable. See "Resume".                                                                                                                             |
| Message length                      | Maximum 2,000 characters per participant message. Over the limit, the participant sees a friendly message asking them to shorten it, and their text stays in the box to edit. Enforced on both the client and the server.                                                                                                                                                                                                                                            |
| Abuse limits                        | One in-flight turn per interview, per-interview rate limit, total message cap, request size limit. See "Abuse protection".                                                                                                                                                                                                                                                                                                                                           |
| Raw message retention               | `interview_messages` rows are deleted once the transcript has been written to `interviews.transcript`. The redactable transcript is the only copy.                                                                                                                                                                                                                                                                                                                   |
| Duplicate completion                | The shared `completeInterview` (voice and text) gets an atomic "already completed" guard. A duplicate completion is skipped and logged with a descriptive warning.                                                                                                                                                                                                                                                                                                   |
| Abandonment                         | Feedback-specific thresholds, since the whole interview is short. "Active" means the participant sent a message or was typing. The AI nudges after 5 min with no activity, but never nudges someone who has been typing in that window. The interview auto-completes after 10 min with no activity. The participant's screen then switches to a "timed out due to inactivity" screen (see Client). See Idle handling for the details, including the cap interaction. |
| Ending                              | AI wraps up. No "End interview" button. A persistent help message under the input tells the participant how to leave: "To end the interview, just tell the interviewer that you need to go."                                                                                                                                                                                                                                                                         |
| Mobile                              | Stays blocked. Text mode is desktop-only for v1. Layout need not be mobile-friendly.                                                                                                                                                                                                                                                                                                                                                                                 |
| Out of scope                        | Text mode for discovery studies; typing-to-voice switching (needs transcript carry-over into the voice agent, transcript merging, and per-segment mode); keeping the discarded voice segment's content; resuming on another device, or resuming a voice interview or the pre-start countdown (only same-browser resume of an in-progress text interview is in v1); early-exit button; study-level mode restriction; mobile support.                                  |

## Participant flow

Feedback studies: `loading → mobile-blocked | intro → intake → mode-select (new) → call (voice) | chat (new) → done | timed-out (new)`

Discovery studies: unchanged, `loading → mobile-blocked | intro → intake → call → done`. Everything below about mode-select, the typing option, and the restart link applies to feedback studies only.

- `interview-flow.tsx` gains a `mode-select` step after `onStarted`, a `chat` step, and a `timed-out` step, all reachable only when `type === 'feedback'`. For discovery, `onStarted` goes straight to `call` as today. `mobile-blocked` is untouched.
- The `loading` step now also checks for a saved text interview before choosing the first screen (see Resume). Discovery studies never save one, so their load is unchanged.
- Intro disclosure: only the feedback intro screen (`feedback-intro-screen.tsx`) changes. Adjust its copy so it also covers "if you choose to type, the conversation is saved as a transcript." The discovery intro is untouched.
- Mode-select screen: countdown (10 → 0), "Start now", discreet "Switch to typing". Choosing typing cancels the countdown.
- Mic permission is still requested by the provider SDK when the voice call mounts. For feedback studies, `live-call.tsx` gains the mic-error message with a retry button and the switch link below. For discovery studies the mic error stays as it is today (no typing option).
- **Restart with typing:** during the voice call, a discreet "Can't use voice? Restart with a typing interview" link shows for the first 30 seconds (counted from the call reaching `in-progress`) and then disappears. It also shows on the mic error screen, with no time limit there.
  1. Client calls `POST /api/interviews/[id]/switch-to-text`.
  2. On success, the client stops the provider call and moves to the `chat` step. The chat starts empty with a fresh greeting. Nothing from the voice segment is shown or carried over.
  3. A short confirmation ("This will restart your interview in typing mode") is shown before the switch, since it discards what was said.
- Disclosure copy should say that if the participant starts with voice, audio is recorded even if they switch to typing within the first seconds.

## Data model

New migration (next number after `0019`):

- `interviews.mode text not null default 'voice' check (mode in ('voice','text'))`.
- `interviews.lastActivityAt timestamptz null`, used for the idle nudge and auto-complete. Updated when the interviewer finishes a reply (the participant now has something to answer), when the participant sends a message, and when the participant is typing (see Idle handling). The scripted idle nudge does not update it.
- `interviews.idleNudgeSentAt timestamptz null`, so the nudge is sent once.
- `interviews.switchedToTextAt timestamptz null`, set when a participant restarts in typing mode. Lets researchers see who switched.
- New table `interview_messages` (a regular table; Postgres temp tables are per-connection and would vanish between serverless requests):
  - `id uuid pk`, `interview_id uuid references interviews on delete cascade`, `seq int not null`, `speaker text check in ('interviewer','participant')`, `text text not null`, `client_message_id text null`, `created_at timestamptz default now()`.
  - `unique (interview_id, seq)`: the database enforces ordering and rejects conflicting concurrent turns.
  - `unique (interview_id, client_message_id)`: makes retries and double submits idempotent.
  - Append-only while the interview is in progress.
  - Used only for text interviews while they are in progress. The `transcript` column on `interviews` stays the source of truth for everything downstream, and is filled at completion. The rows are deleted right after that, so PII redaction on the transcript is not undermined by a raw copy (see completion steps).

Domain (`src/domain/interview.ts`): add `mode: InterviewMode`, `lastActivityAt`, `idleNudgeSentAt`. Update the repository interface, the Supabase implementation, the in-memory fake, and the contract tests.

Text interviews have no `voiceProvider`, `vapiCallId`, `elevenLabsConversationId` or `recordingUrl`. Decide whether to make `voiceProvider` nullable or keep copying the study's value (simpler; mark it unused for text). Recommend keeping the copy and relying on `mode`.

Export and dashboard: the recording player and anything keyed on `recordingUrl` must be hidden when `mode === 'text'`. Show a mode badge on the interview row.

## Back end

### New endpoint: `POST /api/interviews/[id]/text-turn`

- Input: `{ clientMessageId: string, message?: string }`. No `message` = the opening turn.
- Loads the interview and its study. Rejects if the study is not a feedback study (`study.type !== 'feedback'`), `mode !== 'text'`, or `status` is `completed` or `expired`. For a completed interview the error response carries the `endedReason`, so the client can show the right end screen (see Client).
- Validates the request before doing any work: body size limit, `clientMessageId` present, and `message` trimmed, non-empty, and at most 2,000 characters (counted in Unicode characters, the same way as the client). Over the limit returns 422 with code `message-too-long` and a friendly message (see Client); nothing is saved and no LLM call is made. The opening turn (no `message`) is allowed only when the interview has no messages yet.
- Applies the abuse limits (see "Abuse protection") before the LLM call.
- First call: `startInterview` (pending → in-progress, sets `startedAt`).
- Inserts the participant message into `interview_messages` (see Data model). A duplicate `clientMessageId` is a no-op: the route returns the existing reply (or the in-progress one) instead of running another turn. If the last message in the table is already a participant message with no interviewer reply, the route returns 409 ("still replying").
- Builds `messages` from the table (ordered by `seq`) and calls the existing `generateTurnStreaming` (`src/voice-session/generate-turn.ts`), which already yields `text-delta` and `done {utterance, isInterviewOver}` and persists time-check, extension, and open-floor side effects. Those flag updates become conditional (`where timeCheckAskedAt is null`, etc.) so concurrent requests cannot set them twice.
- Streams deltas to the browser as SSE or a chunked response. On `done`, inserts the interviewer message with `seq = last + 1`; a unique-constraint violation means another writer got there first, so the reply is discarded. The insert happens even if the client has disconnected, and `lastActivityAt` is updated.
- If `isInterviewOver`, runs the completion step described below.
- Add a small `messagesToOpenAI` helper rather than changing the agent API (`generateTurn` takes `OpenAIChatMessage[]`).

#### How an interview ends and how the transcript gets written

Voice interviews end when the provider hangs up and sends a webhook. Text has no provider, so the server ends the interview itself, in one of two ways:

1. **Agent-decided end (normal).** `generateTurnStreaming` returns `isInterviewOver: true` when `FeedbackAgent` wraps up: the model's closing turn, the scripted open-floor close, or the hard time cap (evaluated on every turn). The route saves that final interviewer message, then completes the interview.
2. **Idle end.** The idle sweep completes the interview after 10 minutes without activity (no message and no typing), or earlier if the time cap has already passed (see Idle handling). This covers a participant who goes silent past the hard cap, since caps are only evaluated when a turn happens.

Completion (shared helper, `completeTextInterview`):

1. Build `TranscriptEntry[]` from `interview_messages` ordered by `seq`. `timestampMs` = message `created_at` minus `startedAt`, so the transcript matches the voice shape.
2. Call `completeInterview` with that transcript, `recordingUrl: null`, `completedAt`, and `endedReason: 'text-interview-ended'`, `'participant-inactive'`, or `'message-limit'`. It writes the `transcript` column, then runs the summary, email, and completion webhook as for voice.
3. Only if `completeInterview` actually completed the interview (it returns whether it did), delete that interview's `interview_messages` rows. If the delete fails, log it and let the idle sweep retry: it also looks for completed text interviews that still have message rows.

**Duplicate completion guard (shared by voice and text), in `completeInterview`:**

- The first step is an atomic claim: `update interviews set status = 'completed', transcript = ..., ... where id = ? and status <> 'completed'`, returning whether a row changed. This needs a new conditional-update method on the interview repository (with the in-memory fake and contract tests).
- If no row changed, another completion already won: log `console.warn` with a descriptive message and return without writing the transcript or running the summary, email, or webhook. Example: `Ignoring duplicate completion for interview <id>: it is already completed (status=completed, completedAt=<ts>, original endedReason=<x>). Incoming event: endedReason=<y>, source=<vapi|elevenlabs|text-turn|idle-sweep>, vapiCallId/elevenLabsConversationId=<id>. No transcript, summary, email, or webhook was triggered.`
- This replaces relying on webhook de-duplication, and covers repeated provider webhook deliveries, a webhook racing a client-side stop, and the text route racing the idle sweep.
- Changing the voice path is the one place where this plan touches existing voice behaviour. The normal single-completion flow is unchanged, and existing voice tests must still pass.

Everything downstream (summary, exports, redaction, downloads) reads `interviews.transcript` and is unchanged. After completion, further message inserts are rejected: the insert runs through a database function that checks `status = 'in-progress'` in the same statement, so a late message cannot land after completion.

### Abuse protection

`text-turn` is a public route authorised only by the (unguessable UUID) interview id, and every accepted message costs an LLM call. Layers, all enforced on the server:

1. **One turn at a time per interview.** A new message while the previous one has no interviewer reply yet gets 409. A flooder can't fan out parallel LLM calls on one interview.
2. **Request limits.** Request body size limit (a few KB), and the 2,000-character message limit, checked before parsing further or touching the LLM.
3. **Per-interview rate limit.** Counted from `interview_messages.created_at`, so no extra infrastructure is needed: for example a minimum of 2 seconds between participant messages and no more than 10 per rolling minute. Over the limit returns 429 with a friendly "please slow down" message. Numbers are starting points.
4. **Total message cap.** For example 50 participant messages per interview. A normal feedback interview is well under that. At the cap, the interview completes with `endedReason: 'message-limit'` and the participant sees the normal completion screen.
5. **Time cap.** The 15-minute cap ends the interview on the next turn, and a completed interview rejects everything, so the total number of turns is bounded in time as well.
6. **Idempotency.** Retries with the same `clientMessageId` are free and don't create LLM calls.
7. **Sweep endpoint** uses a shared secret compared in constant time.

Not covered: someone creating many interviews through the intake form. Per-interview limits don't apply across interviews, and that exposure already exists for voice. A per-IP limit would need a shared store (none exists in the repo). Treat it as a follow-up, not part of this feature.

### New endpoint: `POST /api/interviews/[id]/switch-to-text`

Order matters, because the voice call's end-of-call webhook would otherwise complete the interview.

1. Reject if the study is not a feedback study, the interview is `completed` or `expired`, already `mode = 'text'`, or the voice call has been running longer than 30 seconds (server-side check against `startedAt`, with a few seconds of grace for client/server clock skew). The mic-error case has no `startedAt`, so it always passes.
2. In one update: set `mode = 'text'`, `switchedToTextAt = now`, `transcript = null`, `startedAt = null`, `status = 'pending'`, and reset time-check fields (`timeCheckAskedAt`, `extensionGranted`, `secondTimeCheckAskedAt`, `openFloorAskedAt`). Clear `vapiCallId` and `elevenLabsConversationId` and set `recordingUrl = null`, so no recording is shown for the discarded segment. Keep a note of the ids in logs in case the provider-side recording needs deleting.
3. Only after this succeeds does the client stop the provider call.

Guards that make this safe:

- **Webhooks:** the Vapi and ElevenLabs webhook handlers (`voice-session/*/webhook-handler.ts`) must ignore call-started and call-ended events for an interview whose `mode` is `text`. Otherwise `startInterview` or `completeInterview` would run against it.
- **In-flight voice turns:** the custom-LLM endpoints (`api/vapi/chat/completions`, `api/elevenlabs/custom-llm/chat/completions`) reject requests for a text-mode interview, so a late request from the dying call cannot write anything.
- **Provider recording:** if the provider supports deleting a recording or conversation, delete the discarded one as a best-effort follow-up. Failure must not block the switch.

### Opening turn (resolved in phase 2)

Voice participants speak first, and the Vapi assistant has no `firstMessage` (see `vapi-live-call.tsx`). The Claude adapter already handles an empty history: `buildInterviewMessages` prepends a synthetic "[The interview session has started.]" user turn when the history is empty or starts with the interviewer. So no new opening-turn path was needed: a `text-turn` request with no `message` and no stored messages generates the greeting from an empty history.

Known wording gap: the adapter's `speak_and_decide` tool description still says the utterance is "said out loud … read aloud". It is static for every call. The text prompt's "This is a written chat" block and the text response contract override it in practice, but review real text transcripts for any spoken-style wording that slips through, and make the tool description channel-aware if it does.

### Prompt tuning (text variant)

The feedback prompt was written for spoken conversation, and some of it reads badly in chat. Casual rapport questions such as "how's your week?" work out loud but feel odd typed, because small talk is harder over text. Text mode gets its own prompt guidance. The discovery prompt is out of scope.

**Mechanics** (`feedback-system-prompt.ts`, `feedback-agent.ts`, `generate-turn.ts`):

- Add `channel: 'voice' | 'text'` to `FeedbackPromptContext` and `FeedbackAgentTurnInput`, defaulting to `'voice'`. `generateTurn` / `generateTurnStreaming` pass `'text'` when the interview's `mode` is `text`.
- For `channel: 'text'`, append a `TEXT_CHANNEL_GUIDANCE` block to the generated prompt, and also to a study's `customPrompt` (custom prompts are usually written for voice, so the guidance is added after them, the same way `RESPONSE_CONTRACT` is). For `channel: 'voice'`, the output must be identical to today's.
- The "Tone" section's "Warm, brief, conversational" line stays. The text block adds specifics on top.

**What `TEXT_CHANNEL_GUIDANCE` says** (draft, wording to be refined against real transcripts):

- This is a written chat, not a call. The participant is reading and typing, so keep every message short: one question per message, usually one to three short sentences, well under about 40 words.
- Skip small talk and rapport openers ("How's your week?", "How are you doing today?"). A friendly one-line greeting is fine; then go straight to a concrete question about the session.
- Ask questions that are easy to answer in a sentence or two. Prefer a specific moment ("What's one thing from today that stood out?") over broad or abstract prompts. Where useful, make the answer shape obvious ("What worked well, and what didn't?" is two questions: ask one at a time).
- No long preambles, no stacked acknowledgments ("Great, thanks so much for that, that's really helpful, and I appreciate you sharing…"). One short acknowledgment at most, then the next question.
- Plain text only: no bullet lists, headings, bold, or emoji.
- Don't write spoken-style filler or verbal tics, and don't refer to talking, hearing, or listening ("thanks for sharing that with me" is fine; "I hear you" is not).
- If the participant gives a short answer, accept it and move on, or ask one small follow-up. Don't pad.
- If the participant says they need to go or want to stop, honour it straight away with a short, friendly goodbye. Don't ask another question or try to keep them. (Verify in `shared-prompt-parts.ts` / `RESPONSE_CONTRACT` that the model reliably sets `participantRequestedEnd` in this case; the help message promises this behaviour.)

**Opening message.** The first chat message is a short greeting by first name, one line on what the feedback is about, and the first concrete question. It does not open with small talk. This needs verification in code (see Open question above) because the voice flow has the participant speak first.

**Other spoken-only text to check:** `shared-prompt-parts.ts` (`RESPONSE_CONTRACT`, `INTERVIEWER_NAME`, and anything else shared) and the scripted `OPEN_FLOOR_UTTERANCE` ("Before we wrap up, is there anything else on your mind about today's session?"). The open-floor line reads fine in chat and the agent matches on its fragments, so leave it unchanged unless review finds a problem.

**Quality bar.** Prompt guidance is not a guarantee. Review a handful of real text transcripts from each feedback study type after the first rollout, check message length and tone, and tighten the wording. Don't add hard length enforcement in v1.

### Time cap in text mode

`FeedbackAgent` checks the typed interview's 15-minute cap only when a turn is generated. Today, if the cap has passed when the participant sends a message, the model still replies normally (possibly with another question) and the interview ends right after. That is abrupt in a chat, so text mode adds a closing:

- When the time cap ends the interview in `channel: 'text'`, `FeedbackAgent` appends a fixed `TEXT_TIME_CAP_UTTERANCE` (for example "We're out of time, so we'll wrap up here. Thank you for your feedback!") to the model's reply. It follows the same append approach as the open-floor line, in both `generateNextTurn` and `generateNextTurnStreaming` (as an extra `text-delta` before `done`). The scripted open-floor question is not asked in this case.
- Refinement: because the cap depends only on elapsed time and not on the model's output, text mode can detect "cap already passed" before calling the model. In that case, pass the existing closing guidance ("do not ask another question, give a brief warm goodbye") so the model's reply doesn't end on a question, and still append the fixed line. Drop this refinement if it complicates the agent more than it helps.
- Voice behaviour is unchanged.
- If a participant stays silent past the cap, the idle sweep ends the interview 5 minutes after their last activity with `endedReason: 'participant-inactive'`, so they see the inactivity screen (see Idle handling).
- A participant can still end early by saying so. The model flags `participantRequestedEnd` and the interview ends. Make the minimum edits so they read naturally in chat, without forking the prompts. This is a review step, not a rewrite.

### Idle handling

Route: `POST /api/internal/text-idle-sweep`, protected by a shared secret and triggered on a schedule (every minute). No scheduler exists in the repo yet. Use the host's cron (Vercel Cron if deployed on Vercel; confirm the deploy target).

For each `in-progress` text interview:

**What counts as activity.** `lastActivityAt` is the most recent of: the interviewer finishing a reply, the participant sending a message, and a typing signal. The idle clock therefore starts when the participant has something to answer, not when they last wrote.

**Typing signal.** While the participant has a non-empty draft that is changing, the client calls `POST /api/interviews/[id]/typing` at most once every ~20 seconds. It carries no text, only the fact that they are typing. The server sets `lastActivityAt = now` and clears nothing else. The endpoint does no LLM call and doesn't count toward message limits, but it is rate-limited (it ignores calls closer than ~10 seconds apart) and rejects completed or non-text interviews.

For each `in-progress` text interview:

- **Nudge.** No activity for ≥ 5 min, `idleNudgeSentAt` is null, and the time cap has not passed: insert an interviewer message ("Are you still there? Take your time — reply whenever you're ready."), set `idleNudgeSentAt`. This is scripted, with no LLM call. Anyone who typed within the last 5 minutes has a fresh `lastActivityAt`, so they are never nudged. The insert uses the same `seq = last + 1` rule, so it can't overwrite a participant reply sent at the same moment (the loser of the race simply skips). The nudge does not update `lastActivityAt`. The client picks it up through polling.
- **Time cap already passed.** If the 15-minute cap has passed (measured from `startedAt`) and there has been no activity for ≥ 5 min: skip the nudge and complete the interview with `endedReason: 'participant-inactive'`. A nudge would only invite a reply that ends the interview anyway.

  **Changed in phase 4 (was `time-cap`):** the sweep can only end an interview whose participant has stopped responding, so every ending it decides is `participant-inactive` and shows the inactivity screen. As first written (with a 7-minute cap and a 7-minute inactivity limit), an idle interview was always past the cap before it reached the inactivity limit (idle time can't exceed age), so the cap rule would have won every time and the inactivity screen would never have appeared outside the 30-minute backstop. `time-cap` is now only recorded in the turn itself, when the participant is still replying as the cap runs out (closing line included).

  **Typed-interview timings (changed after trying typed interviews):** the cap for typed interviews is 15 minutes, the nudge comes after 5 minutes with no activity, and the interview ends after 10 minutes with no activity. Spoken feedback interviews keep their 7-minute cap. With these numbers the inactivity limit (10) is below the cap (15), so a participant who walks away mid-interview is ended by inactivity, not by the cap. The 30-minute backstop is unchanged. Note that `FEEDBACK_TARGET_MINUTES` (5), the "aim to wrap up in about 5 minutes" hint in the prompt, is shared with spoken interviews and was not changed.

- **Inactivity end.** No activity for ≥ 10 min: run `completeTextInterview` with `endedReason: 'participant-inactive'`. The participant's browser learns about this through the state endpoint (see Client). The transcript is built from `interview_messages`, so abandoned interviews are not lost.
- **Absolute backstop.** Any in-progress text interview whose `startedAt` is more than 30 minutes ago is completed as `participant-inactive`, so that a typing signal can't keep an interview open forever.

A participant message clears `idleNudgeSentAt`. Typing alone after a nudge also bumps `lastActivityAt`, so it pushes the 10-minute end out, but it doesn't clear the nudge flag, so no second nudge is sent.

## Resume (same browser)

Without this, a refresh sends the participant back through intro and intake, which creates a second interview and leaves the first as an orphan that the idle sweep later completes (sending its own summary email and webhook). Resume prevents that for text interviews.

**Saving.** When a feedback participant enters the chat (they chose typing, or the restart switch completed), the client saves `{ interviewId }` in `localStorage` under a key scoped to the study link token (for example `interview:<linkToken>`). All storage access is wrapped in try/catch, because it can be unavailable (private windows, blocked storage); if it fails, the interview works normally and just isn't resumable. The id is an unguessable UUID, which is how the interview routes are already authorised.

**Loading.** On mount, after the mobile check, `interview-flow.tsx`:

1. Reads the saved id for this link token. If none, continues to the intro as today.
2. Calls `GET /api/interviews/[id]/text-state?linkToken=...` and stays on the `loading` screen until it answers (to avoid flashing the intro).
3. Routes by the result:
   - In progress and `mode = 'text'`: go straight to the `chat` step with the saved messages loaded. Intro and intake are skipped.
   - Completed with `endedReason = 'participant-inactive'`: show the timed-out screen, then clear the saved id.
   - Completed for any other reason: show the completion screen, then clear the saved id.
   - Not found, belongs to a different study, not text mode, or still `pending` with no messages: clear the saved id and continue to the intro as today.
   - Network or server error: show a retry; don't clear the saved id, so a flaky connection doesn't lose the interview.
4. If the participant instead reaches a normal ending (completion or timeout) during a session, the saved id is cleared at that point.

**`GET /api/interviews/[id]/text-state`** (also used by the in-chat polling below). Returns `{ mode, status, endedReason, firstName, startedAt, messages: [{ seq, speaker, text, createdAt }] }`. The server checks that the interview belongs to the study for the given link token and that the study is a feedback study. It reads from `interview_messages` while the interview is in progress, and from `transcript` once completed (the message rows are deleted by then). It does not re-check link validity, so a participant already mid-interview can continue even if the link is closed or expires meanwhile.

**Behaviour after resume:**

- The clock does not reset. `startedAt`, the 15-minute cap, and the idle timers all continue, so a participant who was away for a while may be near the cap or already timed out.
- A reply that was being generated when the page was refreshed was still saved by the server, so it appears in the loaded messages. If it isn't there yet, the poll shows it when it lands. Sending is blocked while the last message is a participant message with no reply (the existing 409 rule).
- Two tabs on the same interview both work and stay in sync via polling. A send from one tab while the other is mid-reply gets the 409 "still replying" response.

**Not covered:** other devices or browsers, cleared site data, voice interviews, and refreshing during the pre-start countdown or the voice call (those still start fresh and orphan the old interview, as today). A shared computer: whoever opens the same link in the same browser before the interview ends can resume and see the conversation. The saved id is cleared when the interview ends, and this is accepted for v1.

## Client

New components in `src/app/interview/[linkToken]/`:

- `mode-select-screen.tsx`: countdown plus the two choices.
- `text-chat.tsx`: message list (interviewer left, participant right), streaming render, auto-scroll, multiline input (Enter sends, Shift+Enter newline), input disabled while the AI is responding or the interview is over.
- **Help message:** a small, always-visible line under the input: "To end the interview, just tell the interviewer that you need to go." It stays visible for the whole chat and disappears with the input when the interview ends. It relies on the existing leave-request handling: when the participant says they need to leave, the model flags `participantRequestedEnd` and `checkTermination` ends the interview immediately, with no minimum-depth requirement. This is the only early-exit mechanism in text mode.
- `timed-out-screen.tsx`: shown when the interview ended because of inactivity.
- `onEnded` flows to `CompletionScreen` as for voice when the interview ended normally.

Behaviour:

- On mount, requests the opening turn.
- Streams from `text-turn` using `fetch` with a `ReadableStream` reader.
- Polls `GET /api/interviews/[id]/text-state` every ~15–30 s while the tab is visible, and once immediately when the tab becomes visible again. It returns the state described under Resume (`messages`, `status`, `endedReason`, and so on) and serves two purposes here: delivering the 5-minute idle nudge, which is only useful if it appears unprompted, and detecting that the interview ended while the participant was away.
- Interview over (normal): shows the final AI message, then transitions to `CompletionScreen` after a short delay.
- **Interview timed out (`endedReason === 'participant-inactive'`):** whichever happens first, the poll sees `status = 'completed'` with that reason, or a send attempt is rejected with the same reason, the chat input is disabled immediately and the UI switches to `timed-out-screen.tsx`. The screen says the interview ended because there was no activity for 10 minutes and that their responses so far were saved. It has no restart option. The completed-interview summary email is unaffected, because `completeInterview` still runs.
- A message typed just as the timeout lands is not lost to the participant's view: the send is rejected, and they see the timed-out screen rather than a generic error.
- Reuse the existing `backgrounded` signal? Not for v1. Backgrounding is harmless for text.
- Network error on send: show an inline retry, keeping the unsent text.
- **Message too long:** the input shows a live character count near the limit. Above 2,000 characters, Send is disabled and a friendly note appears, for example "Your message is a bit long (2,340 of 2,000 characters). Please shorten it a little and send it again." If the server rejects with `message-too-long` anyway, show the same note. The text always stays in the box so the participant can edit it down, never cleared.
- **Rate limited (429):** show "You're sending messages quite fast. Please wait a moment and try again." and keep the text.
- **Message limit reached:** the interview completes and the normal completion screen shows.

## Tests

- Unit: `messagesToOpenAI`; timestamp calculation (`created_at` minus `startedAt`).
- Idle sweep tests: nudge once at 5 min of no activity; no nudge when there was a typing signal or message within 5 min; the nudge itself doesn't reset the idle clock; completes at 10 min of no activity as `participant-inactive`; completes as `participant-inactive` (no nudge) when the cap has passed and 5 min have gone by; typing signals keep a not-yet-capped interview alive but the 30-minute backstop still ends it; ignores voice and completed interviews.
- Typing endpoint tests: updates `lastActivityAt`; calls closer than ~10 s apart are ignored; rejects completed and non-text interviews; the client sends signals only while the draft is non-empty and changing, at most one per ~20 s, and never sends the text.
- Route tests for `text-turn`: opening turn, normal turn, rejects on voice interview, rejects on completed, completion path calls `completeInterview` with the transcript built from messages.
- Concurrency tests: two simultaneous requests (one runs, the other gets 409); the same `clientMessageId` twice saves one message; a conflicting `seq` insert is rejected; scripted check-in flags are set once; a message arriving after completion is rejected.
- Completion tests: route and sweep racing to complete produce exactly one summary and email; abandoned interview's transcript is built from messages; transcript entries match the voice shape; message rows are deleted after a successful completion and kept if completion did not happen; a failed delete is retried by the sweep.
- Duplicate-completion tests (voice and text): a second completion for the same interview does not rewrite the transcript, regenerate the summary, resend the email, or call the webhook, and logs a warning containing the interview id, current status, and the incoming source and reason. The first completion works exactly as before.
- Limit tests: a 2,000-character message is accepted and a 2,001-character one is rejected with `message-too-long` (no save, no LLM call); whitespace-only is rejected; rate limit returns 429; the message cap completes the interview with `message-limit`; an oversized request body is rejected; the opening turn is rejected when messages already exist.
- Repository contract tests for the new fields and the `interview_messages` table (Supabase and in-memory).
- Help message tests: the "just tell the interviewer that you need to go" line is visible throughout the chat and gone once the interview ends; a message like "I need to go" ends the interview (fake LLM sets `participantRequestedEnd`), even in the first exchange, and no open-floor question is appended.
- Prompt tests: `buildFeedbackSystemPrompt` with `channel: 'voice'` returns exactly what it returns today (snapshot or equality against the existing output), including with a custom prompt; `channel: 'text'` includes the text guidance for both generated and custom prompts; `generateTurn` passes `'text'` only for text-mode interviews.
- Time-cap tests (text channel): a typed turn after 15 minutes ends the interview (and one between 7 and 15 minutes does not) and the utterance ends with the fixed closing line, in both the streaming and non-streaming paths; no open-floor question is appended; the voice channel behaves exactly as before.
- Resume tests: after entering the chat, the interview id is saved under the link-token key; reloading with a saved in-progress text interview skips intro and intake and shows the saved messages; a completed interview shows the completion screen and clears the key; a timed-out one shows the timed-out screen and clears the key; an unknown, wrong-study, voice, or pending id is cleared and the normal intro appears; a server error shows a retry and keeps the key; unavailable `localStorage` (throwing accessors) does not break the flow; discovery studies never save or read a key; the state endpoint rejects a link token for a different study and non-feedback studies; the clock and cap continue after resume.
- Study-type tests: discovery studies get no mode-select step and no restart link; `text-turn` and `switch-to-text` reject discovery studies; discovery intake still goes straight to the voice call.
- Timeout tests: the state endpoint reports `participant-inactive` after the sweep completes an interview; the chat switches to the timed-out screen on poll and on a rejected send; the timed-out screen offers no restart.
- Component tests (feedback studies): countdown reaching 0 starts voice; "Switch to typing" cancels the countdown and shows chat; mic-error retry; the restart link appears for 30 seconds then disappears; the restart link is always present on the mic error screen.
- Route tests for `switch-to-text`: succeeds within 30 seconds; rejects after 30 seconds; rejects on completed or already-text interviews; resets timing fields and clears provider ids and recording.
- Webhook tests: call-started and call-ended events for a text-mode interview are ignored and do not complete the interview, generate a summary, or send email.
- Custom-LLM tests: voice turn requests for a text-mode interview are rejected.
- Use the fake LLM provider in `src/llm/` for deterministic streaming.

## Build order

Delivered as six phases, each its own PR. The text UI sits behind a feature flag (off by default) until phases 1–5 are done. Phases 1 and 2 have no user-visible effect.

1. **Foundation (no visible change).**
   - The duplicate-completion guard in `completeInterview`, with the new conditional repository update. This is the only voice-touching change in the phase, so it ships with the existing voice tests as the safety net.
   - Migration for the new `interviews` columns (`mode`, `lastActivityAt`, `idleNudgeSentAt`, `switchedToTextAt`) and the `interview_messages` table, plus domain, repository, in-memory fake, and contract tests.
2. **Text engine (no UI).**
   - `text-turn` route with validation, abuse limits, and concurrency handling; `messagesToOpenAI`; `completeTextInterview`; the `text-state` endpoint.
   - Text prompt variant (`channel` field, `TEXT_CHANNEL_GUIDANCE`, custom-prompt handling) and the text time-cap closing line. Review `shared-prompt-parts.ts` for spoken-only wording.
   - Verify the opening-turn behaviour here. Tested through route and unit tests; nothing in the UI can create a text interview yet.
3. **Chat experience (behind the flag).**
   - Mode-select countdown, `text-chat.tsx` with streaming, the 2,000-character message handling, the "tell the interviewer you need to go" help message, `localStorage` resume, and the disclosure copy on the feedback intro screen. Wired into `interview-flow.tsx` for feedback studies only. Tried on a test feedback study.
   - **As built:**
     - The flag is the server-side env var `TEXT_INTERVIEW_MODE_ENABLED=true` (see `src/lib/feature-flags.ts`). The interview page passes it to `InterviewFlow` as `textModeEnabled`, and the new `start-text` route refuses when it is off.
     - Choosing typing on the countdown screen calls `POST /api/interviews/[id]/start-text`, which marks the still-pending interview as `mode = 'text'`. It is separate from phase 6's `switch-to-text` (restarting an already-started voice call).
     - `text-turn` streams newline-delimited JSON (`text-delta`, then `done` or `error`). It also accepts `retry: true`, which the chat sends after a failed or dropped reply so it doesn't have to wait out the 60-second stale-reply window.
     - After a dropped connection or a still-replying answer, the chat re-reads `text-state` (up to 15 times, 2 s apart) to pick up the saved reply. Regular in-chat polling for the idle nudge is still phase 4.
     - `onEnded` already receives the server's `endedReason`; phase 4 uses it to choose the timed-out screen. Until then every ending shows the thank-you screen.
4. **Idle handling.**
   - Idle sweep route and scheduler, the typing endpoint and the client's typing signal, the 5-minute nudge, in-chat polling, and `timed-out-screen.tsx`. Must ship before real participants use text mode, because without it abandoned interviews stay in progress forever.
   - **As built:**
     - The sweep is `GET`/`POST /api/internal/text-idle-sweep`, protected by `Authorization: Bearer $CRON_SECRET` (the format Vercel Cron sends) and refusing to run if `CRON_SECRET` is unset. It ends at most 5 interviews per run and also deletes raw messages left behind by completed interviews.
     - **The scheduler is not wired up.** The app deploys to Vercel, and a once-a-minute cron needs a Vercel plan that allows it (on the free Hobby plan, cron jobs run at most once a day, and a more frequent schedule in `vercel.json` makes the deploy fail), so no `vercel.json` was added. To turn it on, set `CRON_SECRET` in Vercel and add `{ "crons": [{ "path": "/api/internal/text-idle-sweep", "schedule": "* * * * *" }] }` to `vercel.json`. Any other scheduler that can send the bearer header every minute works too.
     - The typing endpoint is `POST /api/interviews/[id]/typing`. The chat sends at most one signal per 20 seconds, only for a non-empty draft, and never the text.
     - The open chat polls `text-state` every 20 seconds while idle and the tab is visible (and immediately when the tab becomes visible). It does not poll while a reply is being written.
     - The idle nudge is stored as an ordinary interviewer message but filtered out of the history sent to the model, so it can't hide the open-floor question from the agent's "was that the last thing the interviewer said?" check.
     - Only `participant-inactive` shows the inactivity screen. Every other ending shows the thank-you screen.
5. **Dashboard and exports.**
   - Hide the recording player for text interviews, add the mode badge, and verify the transcript download, redaction, and participant email list with text interviews. Needed before researchers see real text interviews.
   - **As built:**
     - A violet "Typed" badge on the study's interview list and the interview detail page (`Typed · switched from voice` when `switchedToTextAt` is set). Voice interviews show nothing, so existing lists are unchanged.
     - The detail page leaves out the Recording section for a typed interview and never calls Vapi/ElevenLabs for one (`getPlayableRecordingUrl`). The recording proxy route also answers 404 for a typed interview.
     - The detail page shows why a typed interview ended next to its status (for example "no activity (timed out)"), since "completed" alone hides a partial transcript. This was not in the original plan.
     - The "download all transcripts" Markdown marks a typed participant with "Interview mode: typed (written chat), not voice." Voice sections are byte-for-byte as before.
     - Checked by reading and by test, no code change needed: redaction and the printable export work from the stored transcript, the participant email list is built from every interview, and study reports read transcripts.
     - Still accepted: a typed interview in progress shows "No transcript available yet" until it completes.
   - After phases 1–5, turn the flag on for real participants, after a manual end-to-end pass (feedback studies in both modes, an inactivity timeout with the tab open and in the background, and a discovery study to confirm it is unchanged and voice-only).
6. **Restart from voice.**
   - `switch-to-text` route, webhook and custom-LLM guards, and the restart link in `live-call.tsx` (30-second window plus mic-error screen). Last because it is the riskiest for voice and the least essential. Includes switching at 5 s, 29 s, 31 s, and from a mic error in its manual pass.
   - **As built:**
     - `POST /api/interviews/[id]/switch-to-text` (`switchToText`): feedback studies only, flag on, not completed. It resets the interview to pending text mode in one conditional update (so a call that already completed itself wins), clears everything the call set, and sets `switchedToTextAt`. A repeat of a switch that went through is accepted; a typing chat that has already begun is never reset (409 `already-typing`).
     - **The window.** The browser shows the link while the call connects and for the first 30 seconds after the interviewer starts speaking, and always on the error screen. The server allows 45 seconds from `startedAt` (30 plus a 15-second grace for clock skew and for Vapi reporting the start earlier than the first spoken word). **ElevenLabs only reports a call's start time after the call ends, so for ElevenLabs the 30 seconds are enforced by the browser alone.**
     - The browser waits for the server's confirmation, then stops the call (`vapi.stop()` / `endSession()`), then opens the chat. A flag makes the call's own end/error events be ignored meanwhile, so stopping it isn't taken for the interview finishing. If the server refuses, the call keeps running and the participant sees an error.
     - Clicking the link asks "This restarts your interview in typing mode, and what's been said so far is discarded" first; on the error screen it goes straight through.
     - **Webhooks and turns.** The Vapi and ElevenLabs webhook handlers ignore call-started and call-ended events for an interview in text mode. The Vapi and ElevenLabs custom-LLM endpoints answer 409 for one before generating or writing anything. A Vapi turn now loads the interview itself and hands it to the turn generator, so there is no extra database read.
     - **Discarded recording.** Deleted from the provider when the discarded call's end-of-call webhook arrives (`deleteVapiCall`, `deleteConversation`), not at switch time, because the server doesn't know the call's id until that webhook. Best-effort: a failure is logged and the webhook still succeeds. **The delete endpoints (`DELETE /call/{id}` on Vapi, `DELETE /v1/convai/conversations/{id}` on ElevenLabs) are unverified against the real APIs.**
     - **Retry** (not in the original plan): a "Try again" button on the error screen when the call failed before the interviewer ever spoke, for feedback studies with text mode on only. It starts a fresh call for the same interview.

## Rollout and enabling

The code is deployed to Production with the feature switched off: without `TEXT_INTERVIEW_MODE_ENABLED=true` every study behaves exactly as it did before, and the new typing routes refuse. Turning it on is a configuration change plus a redeploy, in this order. The order matters: the scheduler must exist before the flag, or abandoned typed interviews stay "in progress" forever.

### Before you start

- **Migration `0020_add_text_interview_mode.sql` is applied** to the Supabase project the target environment uses. It adds the `mode`, `last_activity_at`, `idle_nudge_sent_at`, and `switched_to_text_at` columns, the `interview_messages` table, and the `append_interview_message` function. Production and Preview use the same project (checked 2026-10-04: the Production `NEXT_PUBLIC_SUPABASE_URL` matches the project the migration was applied to; the server-side `SUPABASE_URL` is a hidden secret and could not be compared directly). If you ever point an environment at a different project, apply the migration there first or intake fails on the new `mode` column.
- **You know your Vercel plan.** A once-a-minute cron needs a plan that allows it. On the free Hobby plan, cron jobs may run at most once a day, and a more frequent schedule in `vercel.json` makes the deploy fail.
- **The manual end-to-end pass is done on Preview** (steps below).

### Enabling it in Production

1. **Choose the scheduler.** Either Vercel Cron (below) or any other scheduler that can call `GET`/`POST /api/internal/text-idle-sweep` every minute with `Authorization: Bearer <CRON_SECRET>`.
2. **Set `CRON_SECRET` in Production** (any long random string). Vercel Cron sends it automatically as the bearer token when a variable of that name exists. The sweep refuses to run, with a 500, when it is unset.
3. **Add the cron to `vercel.json`** and deploy it:
   ```json
   { "crons": [{ "path": "/api/internal/text-idle-sweep", "schedule": "* * * * *" }] }
   ```
   There is no `vercel.json` in the repo today. Check the project's Cron Jobs page in Vercel shows the job after the deploy.
4. **Check the sweep works before enabling anything.** Run it once by hand and expect HTTP 200 with a body like `{"checked":0,"nudged":[],"completed":[],"deferred":0,"cleanedUp":[]}`:
   ```bash
   curl -s -X POST https://user-interviewer.vercel.app/api/internal/text-idle-sweep \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
   Without the header it must answer 401, and the Vercel logs should then show a "Text idle sweep: checked …" line roughly every minute.
5. **Set `TEXT_INTERVIEW_MODE_ENABLED=true` in Production.**
6. **Redeploy Production.** Environment variables only apply to new builds, so setting a variable alone changes nothing. Redeploy the latest production deployment from the Vercel dashboard, or push a commit.
7. **Smoke test on Production** with a real feedback study you control (use your own email, because completing an interview sends the summary email there):
   - The feedback intro mentions typing, and after intake a 10-second countdown appears with "Switch to typing" as a discreet link.
   - Switch to typing, answer a few messages, then say you need to go. The thank-you screen shows, the interview is completed with a transcript, the summary exists, and the email arrived.
   - A discovery study still shows the old intro and goes straight to the voice call.
   - One normal voice interview on a feedback study still completes.

The flag is deploy-wide. There is no per-study setting, so once it is on, every feedback study offers typing (discovery studies never do). That was a deliberate decision, not an oversight.

### Manual end-to-end pass (on Preview, before Production)

Preview already has `TEXT_INTERVIEW_MODE_ENABLED` and `CRON_SECRET` set. Follow [PREVIEW_TESTING.md](PREVIEW_TESTING.md) to deploy: merge the branch into `preview` and push, then use `https://user-interviewer-git-preview-df-dc33.vercel.app`. Vercel Cron only calls Production deployments (check Vercel's current documentation), so on Preview run the sweep by hand with the same `curl`, using Preview's `CRON_SECRET`.

1. **Typed interview.** Switch to typing at the countdown, answer a few messages, refresh mid-chat (the chat comes back), then end it by saying you need to go. Check the transcript, the summary, the email, and that `interview_messages` is empty for it afterwards.
2. **Idle behavior.** Shift timestamps in SQL instead of waiting: set `last_activity_at` to 6 minutes ago and `started_at` to 8 minutes ago, run the sweep (expect the nudge to appear in the open chat within about 20 seconds); set `last_activity_at` to 11 minutes ago and run it again (expect "ended due to inactivity"). Typing in the box without sending should stop a nudge.
3. **Time cap.** With `started_at` 16 minutes ago, send a message. The reply ends with "We're out of time…" and the thank-you follows.
4. **Restart from voice** (needs the provider webhooks to reach the Preview alias, which the dedicated preview assistant and agent do). Start a voice call and restart as typing at about 5 seconds and at about 29 seconds; the link disappears after 30 seconds. Deny the microphone and restart from the error screen. No summary email should arrive for the discarded call, and the interview must not be completed by its webhook. Check whether the discarded recording was deleted at the provider.
5. **Nothing else changed.** Feedback study with the flag off, a discovery study with the flag on, and a phone (still blocked).
6. **Dashboard.** "Typed" and "Typed · switched from voice" badges, no Recording section, the end reason, and the transcripts download marking typed interviews.

### Known gaps to close or accept

- The provider delete endpoints for discarded recordings (`DELETE /call/{id}` on Vapi, `DELETE /v1/convai/conversations/{id}` on ElevenLabs) are unverified. If one is wrong, the failure is logged and the recording remains.
- For ElevenLabs, the 30-second restart window is enforced only by the browser (the server learns the call's start time only after the call ends).
- A typed interview in progress shows "No transcript available yet" on the dashboard until it completes.
- The Supabase integration tests are skipped without credentials. Run them once against a real project: `npx vitest run src/repositories/supabase` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set.

### Tuning the timings

All typed-interview timings are constants, so changing one means a code change and a deploy:

| What                      | Value                     | Where                                                                  |
| ------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Hard cap                  | 15 min                    | `FEEDBACK_TEXT_HARD_CAP_MINUTES`, `src/interview-agent/termination.ts` |
| Nudge after no activity   | 5 min                     | `IDLE_NUDGE_AFTER_MS`, `src/text-session/constants.ts`                 |
| End after no activity     | 10 min                    | `IDLE_END_AFTER_MS`, same file                                         |
| Absolute backstop         | 30 min                    | `MAX_INTERVIEW_AGE_MS`, same file                                      |
| Message length / count    | 2,000 characters / 50     | `MAX_MESSAGE_CHARS`, `MAX_PARTICIPANT_MESSAGES`, same file             |
| Restart-from-voice window | 30 s (+15 s server grace) | `SWITCH_TO_TEXT_WINDOW_MS`, `SWITCH_TO_TEXT_GRACE_MS`, same file       |

The prompt's "aim to wrap up in about 5 minutes" hint (`FEEDBACK_TARGET_MINUTES`) is shared with spoken interviews and was not changed for typed ones.

### Turning it off or rolling back

- **Switch off (fastest).** Remove or set `TEXT_INTERVIEW_MODE_ENABLED` to anything other than `true` and redeploy. New participants get the voice-only flow, and `start-text` and `switch-to-text` refuse. Leave the cron and `CRON_SECRET` in place so typed interviews already in progress still get nudged and ended. A participant mid-chat who refreshes after the flag is off lands on the intro instead of resuming, and their half-finished interview is ended by the sweep.
- **Full rollback.** Revert the merge commit of PR #40 on `main` and redeploy. Migration 0020 is additive (new nullable columns, a column that defaults to `voice`, and a new table), so it can stay in the database. Do not drop `interview_messages` while any typed interview is in progress.

## Risks

- **Prompts tuned for speech** sound odd in chat. Mitigated by the text prompt variant. Message length and tone are only guided by the prompt, not enforced, so the wording needs review against real transcripts.
- **Custom prompts:** a study's `customPrompt` fully replaces the generated prompt and is usually written for voice. The text guidance is appended to it, but a custom prompt that explicitly asks for small talk or long messages can still conflict with it.
- **No scheduler** today. The idle sweep depends on adding one.
- **Double submits and concurrent turns** can corrupt transcript order or trigger duplicate AI replies. Mitigated by the append-only messages table (unique `seq` and `client_message_id`), the "no new message while a reply is pending" rule, conditional flag updates, and the atomic completion transition.
- **Resume on shared computers.** Anyone opening the same link in the same browser before the interview ends can resume it and see the conversation. Accepted for v1; the saved id is cleared at the end of the interview.
- **Orphans remain for voice.** A refresh during the countdown or a voice call still creates a second interview and orphans the first, as it does today.
- **Flooding across interviews.** The abuse limits are per interview. Creating many interviews through intake is not covered (an existing exposure).
- **Two sources of truth** while a text interview is in progress (`interview_messages` and, later, `transcript`). Dashboards that read `transcript` show nothing for in-progress text interviews until completion. Accepted for v1.
- **Dashboards assume a recording** exists. Missed spots would show broken players for text interviews.
- **Switch race:** a webhook or voice turn arriving after the switch could complete or corrupt the interview. Mitigated by flipping `mode` before stopping the call and guarding every voice entry point on `mode`.
- **Voice `startedAt`/duration** logic relies on provider timestamps. Text mode sets its own, so check the duration display.
