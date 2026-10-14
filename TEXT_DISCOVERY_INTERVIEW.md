# Text interviews for discovery studies — plan

## Goal

Give every **discovery** study a second participant link that runs the interview as a typed chat. The existing link stays voice-only and unchanged. Both links belong to the same study: one dashboard, one report, one expiry. Typed interviews are marked as such.

This builds on [TEXT_INTERVIEW_MODE.md](TEXT_INTERVIEW_MODE.md) (feedback studies). That engine (`interview_messages`, `text-turn`, `text-state`, typing signals, idle sweep, chat UI, resume) is reused. What is new is the discovery agent in text mode, a second link, and discovery-specific limits.

**Status:** phases 1-5 built on branch `add-text-discovery-interview`; phase 6 (rollout) prepared, not yet shipped. Migration 0024 is applied in Supabase.

## Decisions (agreed)

| Topic | Decision |
| --- | --- |
| Link model | A second, text-only link on the same study. No mode choice, no countdown, no voice option, no restart-from-voice. |
| Which studies | Discovery studies only. Feedback studies keep their in-link typing choice. |
| Creation | New discovery studies get the text link at creation. Existing studies: only study `51076f81-38f6-401a-9a12-f0487a019b98`, by a one-off script. No backfill of other studies. |
| Expiry / closing | One expiry for both links (the study's 7-day window; "Extend link" extends both via the single `linkExtendedAt`). Closing a study closes both. No participant cap or quota exists today, so none is added. No "close link" dashboard control (out of scope). |
| Tracking | No extra tracking id. Typed interviews are distinguished by `interview.mode = 'text'` (the existing "Typed" badge). |
| Prompt | Same approach as feedback text: a `channel: 'text'` guidance block appended to the discovery prompt (also appended to a study's `customPrompt`). Voice prompt output stays byte-for-byte identical. |
| Time cap | A single 60-minute hard cap from `startedAt`, no check-in, no extension. Participants are told "about a 15-minute interview"; the 60 minutes is an upper bound, and the participant is told so plainly: the intro states that the session ends after 60 minutes, and the chat shows a discreet gray countdown of the time remaining. At the cap the session closes with a "this session has ended" note. |
| Minimum depth | The AI may end the interview on its own only after **12** participant messages. An explicit "I need to go" (or similar) ends it immediately, as in feedback text. |
| Message cap | 100 participant messages per interview, as an abuse limit. Ends with `endedReason: 'message-limit'`. Other limits (2,000 chars, rate limit, one turn at a time) unchanged. |
| Idle | One nudge after 5 minutes without activity. No separate inactivity end for discovery: the 60-minute cap is the only thing that ends a silent interview. Feedback keeps its 5 / 10 nudge and inactivity end. |
| Device | Desktop only (existing mobile block applies). |
| Copy | Text link has its own editable landing and ending text, merged field by field: its own copy, else the voice link's custom copy, else text-specific defaults (never the voice defaults, which say "Voice, not text" and "the call is recorded"). |
| Flag | Reuses `TEXT_INTERVIEW_MODE_ENABLED`. Off = the text link shows an "unavailable" page and the typing routes refuse. |

## Assumptions to confirm

1. **12 turns.** The code has two unrelated numbers: the AI-may-end guard (4, `MIN_PARTICIPANT_TURNS_BEFORE_LLM_CAN_END`) and the job-search report minimums (12/14, `src/job-search-study/min-turns.ts`). I assume you mean the first, set to 12 for typed discovery. The report minimum is untouched.
2. **60 minutes is enforced even for an active participant.** The sweep closes any typed discovery interview 60 minutes after `startedAt`, so someone mid-sentence loses an unsent draft. (Feedback's backstop only ends idle interviews.)
3. **"Session has ended" screen.** A new screen for `endedReason: 'time-cap'` on discovery text, showing the study's text ending copy plus a line such as "This session reached its 1-hour limit." Other endings show the normal completion screen; inactivity shows the timed-out screen.
4. **Prompt time awareness.** The discovery prompt currently contains the 15-minute check-in guidance. In text it is suppressed (no "are we out of time?" check-in, no extension question). The 15-minute figure stays only in participant-facing copy.

## Data model

New migration `0024` (`0021`–`0023` were already taken):

- `studies.text_link_token text null unique` — same generator as `link_token`. Null for feedback studies and for discovery studies without a text link.
- `studies.participant_copy_text jsonb null` — text-link landing and ending text; null falls back to `participant_copy`.

Domain / repositories: `Study.textLinkToken`, `Study.participantCopyText`. Add `StudyRepository.resolveLink(token) → { study, channel: 'voice' | 'text' } | null` (matches either token; a text token only matches when the study is discovery). `getByLinkToken` keeps its voice-only meaning. Update the Supabase repo, the in-memory fake, and the contract tests.

`InterviewRepository.create` accepts `mode`, so an interview made through the text link is `mode = 'text'` from the start. No `start-text` call is needed for this path.

## Back end

- **Intake (`participant-intake/start-interview.ts`):** resolve the token with `resolveLink`; create the interview with the mode that matches the link. Same validity, intake and consent rules.
- **Interview page (`app/interview/[linkToken]/page.tsx`):** resolve the link; pass `channel` to `InterviewFlow`. Text link with the flag off or on a non-discovery study → `LinkInvalidScreen` ("not available").
- **Discovery agent in text mode** (`voice-session/generate-turn.ts`, `interview-agent/`):
  - `buildDiscoveryAgentInput` passes `channel: interview.mode`. `InterviewAgent` accepts it; `buildInterviewSystemPrompt` appends `TEXT_CHANNEL_GUIDANCE` for `'text'` (reuse the feedback block, adding discovery notes: one question per message, probe by following the participant's last answer, no stacked acknowledgements). Voice output identical.
  - Text channel: hard cap 60 min (`DISCOVERY_TEXT_HARD_CAP_MS`), no soft cap / extended cap, time-check and second-time-check guidance and side effects skipped, min-turns 12 via the existing `minParticipantTurnsBeforeLlmCanEnd` input. When the cap ends the interview, append a fixed closing line (as `TEXT_TIME_CAP_UTTERANCE` does for feedback) in both the streaming and non-streaming paths.
  - The "one question per turn" limiter (`limitsToOneQuestion`) is a speech aid; decide in phase 2 whether to keep it for text (the prompt already asks for one question). Default: off for text.
- **`text-session` routes drop the feedback-only gate** and use the study type to choose the limits:
  - `text-turn.ts:225`, `text-state.ts:46`, `record-typing.ts:36`: allow discovery. `text-state` accepts either link token for its own study. `choose-text-mode.ts` (`start-text`) and `switch-to-text.ts` stay feedback-only.
  - `constants.ts` gains per-type limits: message cap (50 feedback / 100 discovery), nudge (5 / 5 min), idle end (10 min feedback / none for discovery), hard cap (15 / 60 min), backstop (30 min feedback / 60 min discovery).
- **Idle sweep (`idle-sweep.ts`):** look up each interview's study type to choose the limits. For discovery: send the one 5-minute nudge, never end for inactivity, and close any interview 60 minutes after `startedAt` regardless of activity, with `endedReason: 'time-cap'`. A walked-away discovery interview therefore stays "in progress" until the 60-minute mark. Feedback behaviour unchanged. The sweep must be scheduled before the flag is on (same prerequisite as feedback; the cron is still not wired).
- **Completion** (`completeTextInterview`, summary, email, webhook, report pipelines) is reused unchanged. Job-search report pipelines read the stored transcript, so typed discovery interviews flow through them; verify in phase 5 that the minimum-turn check counts typed messages.

## Participant experience

`loading → mobile-blocked | intro → intake → chat → done | timed-out | session-ended` (no `mode-select` or `call`).

- `interview-flow.tsx` gets a `channel: 'text'` path for discovery: after intake, go straight to `chat`. Reuse `text-chat.tsx`, resume (`localStorage` keyed by the text link token), the "tell the interviewer you need to go" help line, the character counter, and the idle nudge.
- New discovery text intro (a variant of the discovery intro): "about a 15-minute AI-run interview", written chat, **no microphone or recording**, the conversation is saved as a transcript, and **the session ends automatically after 60 minutes**. Landing and ending text come from `mergeTextCopy(participantCopyText, participantCopy)`.
- **Countdown (built):** the chat shows a discreet gray "Time remaining 42:15" (amber for the last five minutes), computed from the interview's `startedAt` and the server's clock (`serverTime` in `text-state`), so it survives a refresh and a wrong device clock. At 0:00 the input is disabled and the chat asks `text-state` every 3 seconds; `text-state` itself closes a discovery session past its cap (`closeIfCapped`), so the session-ended screen appears within seconds even before the cron is scheduled.
- New `session-ended-screen` for the 60-minute cap.
- Desktop only: existing mobile-blocked step.

## Dashboard

- Study page shows a second link, "Text interview link", under the voice link, with the shared expiry note. "Extend link" extends both. Only shown for discovery studies that have a text token.
- Participant-pages form gets a Voice / Text switch. Empty text fields show "Same as voice link" and save as null.
- Typed badge, hidden recording, end-reason display and transcript download already exist; verify they work for discovery.

## Existing study

One-off script (not a migration) that generates a `text_link_token` for study `51076f81-38f6-401a-9a12-f0487a019b98` and prints the URL. Run it on Preview first, then Production. Safe to re-run (does nothing if a token exists).

## Tests

- Link resolution: voice token → voice, text token → text, unknown → none; text token on a feedback study is not matched; contract tests for the new columns on Supabase and in-memory.
- Intake via the text link creates `mode = 'text'`; flag off refuses; expired or closed study refuses both links.
- Discovery text turn: opening turn, normal turn, "I need to go" ends in the first exchange, AI cannot end before 12 participant messages and can after, 60-minute cap appends the closing line (streaming and non-streaming), no check-in or extension side effects set.
- Prompt tests: discovery voice prompt unchanged (equality with the current output, with and without `customPrompt`); text prompt includes the guidance.
- Sweep: discovery nudge at 5 min, no inactivity end (a silent interview survives past 30 minutes), close at 60 min with `time-cap`; feedback timings unchanged; voice and completed interviews ignored.
- Limits: 100th message accepted, 101st ends with `message-limit`; feedback still stops at 50.
- Countdown: shows the remaining time from `startedAt`, survives a reload, disables the input at 0:00, then shows the session-ended screen once the interview is closed.
- UI: text-link flow skips mode-select; session-ended screen for `time-cap`; resume with the text token; copy fallback to voice text; mobile blocked.
- Regression: voice discovery flow, voice and text feedback flows, and existing tests pass unchanged.

## Build order

1. **Foundation.** Migration `0024`, domain, repositories (`resolveLink`, `create` with mode), contract tests. No visible change.
2. **Agent and limits.** Per-type constants, discovery `channel: 'text'` prompt and cap/min-turns handling, drop the feedback-only gates in the text routes, per-type sweep. Tested through routes and unit tests; no UI yet.
3. **Participant flow (behind the flag).** Intake and page link resolution, text intro, chat wiring for discovery, gray 60-minute countdown, session-ended screen.
4. **Dashboard.** Second link display, extend, participant-pages Voice/Text switch.
5. **Verification and the one study.** Typed discovery in the dashboard, exports, and report pipeline (including the minimum-turns check). Create the text link for study `51076f81-…` on Preview, then a manual end-to-end pass: full typed interview, early exit, idle nudge (shift timestamps in SQL; confirm a silent interview is not ended before 60 minutes), 60-minute cap and countdown, refresh/resume, voice discovery link unchanged.
6. **Production.** Run the script against Production after the flag and scheduler are on (see Rollout in TEXT_INTERVIEW_MODE.md; those are already prerequisites for feedback).

## Risks

- **Discovery prompt tuned for speech** reads oddly in chat. Mitigated by the text guidance; review real transcripts after the first interviews.
- **Long sessions.** A 60-minute chat means more concurrent state and a larger `interview_messages` history sent to the model each turn. Check token usage and latency on a long test conversation.
- **Cron dependency.** Without the scheduled sweep, nothing ends idle or capped discovery text interviews.
- **Link spread.** Two public URLs for one study; either can be shared. Both die with the same expiry or closing.
- **Mismatch between "about 15 minutes" and the real length.** Participants may be surprised by a long interview; the prompt, not the cap, is what keeps most near 15 minutes. Review in phase 5.

## Phase 4 as built

- **Study page:** a discovery study shows "Voice interview link" and "Text interview link", each with its own Copy button, under the one shared expiry note ("Links expire …"); "Extend link" extends both. When `TEXT_INTERVIEW_MODE_ENABLED` is off the page says the text link shows "not found" until it is turned on. The new-study confirmation shows both links.
- **Editing landing and ending pages:** a Voice link / Text link switch on the participant-pages page (`?channel=text`). The text form starts from what the text link really shows (its own copy, else the voice link's, else the text defaults) and saves only the fields that differ from that, so untouched fields keep following the voice link. Buttons: "Use the job-search wording", "Match the voice link" (saves null), "Reset to the standard text wording". A warning reminds the editor that inherited voice wording may talk about a call.
- **API:** `PUT /api/studies/[id]/participant-copy` takes an optional `"channel": "text"`; null on the text channel means "follow the voice link". A study with no text link is refused.
- **Job-search studies:** new ones get `JOB_SEARCH_TEXT_PARTICIPANT_COPY` for the text link at creation. For an existing study, open the Text link editor and click "Use the job-search wording", then Save.

## Phase 5: verification results

**Checked by reading the code and by test (no change needed)**

- Dashboard: the interview list and detail page already hide the recording and show the "Typed" badge and the end reason for any typed interview, including `time-cap` ("the time limit was reached") and `message-limit`. A typed interview is never counted as a "dropped call".
- Transcript download marks a typed participant with "Interview mode: typed (written chat), not voice." Redaction, the printable export, the participant email list, the study report, the summary, the summary email and the completion webhook all work from the stored transcript and need no recording.
- One end-to-end test (`discovery-end-to-end.test.ts`) drives a whole typed interview through the study's text link with only the model scripted: intake creates a typed interview of the study, a transcript is stored, the summary and email are produced, the raw messages are deleted, the transcript export is marked, and the job-search report queue counts the typed turns.
- `next build` succeeds.

**Changed**

- **A job-search study's typed interview cannot be ended by the AI before 14 participant messages** (the report's own minimum), not 12. Without this a participant could be thanked after 12 or 13 messages and the report would then fail as "too short". Studies without a report pipeline keep 12. The chat prompt is told the study's number.
- **The report extraction prompt has a typed variant.** It called every transcript "a spoken interview" with "speech-to-text" errors. For a typed interview those two sentences say it is typed (typos, abbreviations). The spoken prompt is unchanged, byte for byte.

**Known gaps (accepted for now)**

- A participant who types "I need to go" before the report minimum on a job-search study sees the normal thank-you screen, not the "ended early" screen with a way to start again that voice participants get. The job-search ending text already says an early finish may not get a report.
- The quote check in the job-search ledger is built for spoken text (it ignores filler words and run-together words). Typed text matches under the same rules, so nothing breaks, but it has only been exercised on spoken transcripts.
- Not yet run against a real model: the discovery chat prompt, the extraction on a typed transcript, and the report on one. Read the first few real typed transcripts for message length, tone, and spoken-style wording.
- Supabase integration tests for the new columns are skipped without credentials. Run `npx vitest run src/repositories/supabase` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set once migration 0024 is applied.

## Manual end-to-end pass (on Preview, before Production)

Prerequisites: migration `0024` applied in Supabase (Preview and Production share one project, so study creation fails everywhere until it is); this branch merged into `preview`; `TEXT_INTERVIEW_MODE_ENABLED=true` and `CRON_SECRET` set on Preview (they are, from the feedback rollout).

1. **Give the study its text link.** `npx tsx --env-file=.env.local scripts/add-study-text-link.ts --study-id=51076f81-38f6-401a-9a12-f0487a019b98 --base-url=<preview URL>` prints both URLs. On the study page, open Edit landing and ending pages, choose Text link, and if the study is the job-search one click "Use the job-search wording" and Save.
2. **Landing page.** Open the text link on a desktop: written wording, "ends automatically after 60 minutes", no FAQ link, no "Voice, not text". On a phone: blocked with the written-interview message.
3. **Typed interview.** Intake goes straight into the chat; the opening message greets by name with no small talk; the gray countdown starts near 60:00; refresh mid-chat and it comes back with the right time. Say you need to go: it ends at once and shows the thank-you screen. Check the transcript, summary, email, and that the dashboard shows "Typed" with no recording player.
4. **Floor.** On a second interview, keep answering briefly: the AI should not wrap up before 12 messages (14 on the job-search study).
5. **Time cap and idle (shift timestamps in SQL).** Set `started_at` to 59 minutes ago and watch the countdown reach 0:00: the input disables and the "session has ended" screen appears within a few seconds. Set `last_activity_at` to 6 minutes ago and run the sweep by hand: the nudge appears. Set `last_activity_at` to 40 minutes ago: it is NOT ended for inactivity.
6. **Both links, one study.** The study page lists both links under one expiry; "Extend link" extends both; the voice link still works exactly as before; a voice interview and a typed one appear in the same list and the same study report.
7. **Flag off.** With `TEXT_INTERVIEW_MODE_ENABLED` unset, the text link shows "not found" and the study page says so.
8. **Production.** After 0024 is applied there, run the script with `--base-url` set to the Production URL, and make sure the scheduler (cron) is wired before real participants use the link (see Rollout in TEXT_INTERVIEW_MODE.md).

## Phase 6: rollout runbook

State when this was written (2026-10-13): migration `0024` applied in Supabase (checked). Preview and Production share that one Supabase project, so no migration step is left. The study to get the first text link is `51076f81-38f6-401a-9a12-f0487a019b98` ("How AI Actually Shows Up in a PM's Day": discovery, no report pipeline, no custom landing copy, so its text link shows the text-specific defaults and nothing about voice). `origin/main` is this branch's base plus merge commits, so shipping is five commits.

Every step below is outward-facing or changes real data; each is done on request, in this order.

1. **Preview.** Merge `add-text-discovery-interview` into `preview` and push (see PREVIEW_TESTING.md). Vercel builds it at `https://user-interviewer-git-preview-df-dc33.vercel.app`.
2. **Text link for the study, then the manual pass.** `npx tsx --env-file=.env.local scripts/add-study-text-link.ts --study-id=51076f81-38f6-401a-9a12-f0487a019b98 --base-url=<site>`. Because Preview and Production share the database, this creates the link for both. It stays dormant on Production until the flag is on there: the text link shows "not found" and the study page says so. Then work through "Manual end-to-end pass" above on Preview.
3. **Scheduler.** `.github/workflows/text-idle-sweep.yml` calls the sweep every 5 minutes. It only runs from `main`, so it starts after step 4. Before that, add the repository secret `TEXT_IDLE_SWEEP_URL` (`https://<production site>/api/internal/text-idle-sweep`). `CRON_SECRET` is already a repository secret (the job-search sweep uses it). Confirm `CRON_SECRET` is set in Vercel Production.
4. **Ship.** Open a pull request from `add-text-discovery-interview` (or `preview`) into `main`, let CI pass, merge. Production deploys.
5. **Check the sweep.** Actions tab, "Typed-interview sweep", Run workflow. Expect a green run and a body like `{"checked":0,"nudged":[],"completed":[],"deferred":0,"cleanedUp":[]}`. Calling the URL without the header must answer 401.
6. **Turn it on.** `TEXT_INTERVIEW_MODE_ENABLED=true` in Vercel Production (it may already be set from the feedback rollout; the flag is deploy-wide, so setting it also enables typing on feedback studies), then redeploy Production, because env vars only apply to new builds.
7. **Smoke test on Production** with your own email (completing an interview sends the summary email there): open the text link, run a short typed interview, say you need to go; check the thank-you screen, the dashboard ("Typed", transcript, no recording), the email, and that the voice link still works. Then share the text link.

**Turning it off.** Unset `TEXT_INTERVIEW_MODE_ENABLED` and redeploy: the text link shows "not found" and new typed interviews stop; keep the scheduler and `CRON_SECRET` so typed interviews already running still get closed. Full rollback is reverting the merge on `main`; migration 0024 is additive and can stay.
