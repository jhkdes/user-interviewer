# AI Voice User-Interviewer — MVP Requirements Blueprint

## Context

Product managers need a fast way to run qualitative discovery interviews without personally scheduling and conducting every call. This tool lets a PM describe a target user group (a "Study"), generate one shareable link, and send it out. Each target user who opens the link is treated as a research **partner**, not just a subject: they're asked for their name and email so the PM can follow up, share what was learned, and potentially invite them to future studies. An AI voice agent conducts a structured discovery interview with each participant (broad → narrow, pain-point-seeking), following product-management best practice (Mom Test–style, non-leading, follow-the-pain probing). As multiple participants complete interviews within a study, the PM can generate a cross-participant analysis to surface shared problems across the target group, not just per-interview findings.

This document is the requirement blueprint for the MVP — scoped intentionally small to validate the idea fast, not to be a full-featured research platform.

See [GLOSSARY.md](GLOSSARY.md) for canonical term definitions used throughout this document.

## Goals (MVP)

- PM can describe a target user profile in plain English and get one shareable study link in under a minute.
- Target user can click the link, provide their name/email, consent, and immediately start talking to an AI voice interviewer — no login, no app install.
- The AI interviewer runs a genuine broad-to-narrow discovery interview, not a scripted questionnaire, and knows when it has dug deep enough.
- PM can review each individual interview (transcript + AI summary + audio) in a simple dashboard.
- PM can, on demand, generate a cross-participant analysis for a study once multiple interviews are in, surfacing shared pain points/themes across the target group.

## Explicit Non-Goals (MVP)

- No full participant accounts/login/password system — just first name + email + a short role blurb captured per session, no persistent auth for participants.
- No in-app participant directory or one-click re-invite flow — participant contact data is captured and stored, but re-outreach for future studies is a manual, outside-the-tool action for now.
- No multi-tenant PM accounts / org management — single internal team, minimal or no auth on the PM side.
- No product/feature-specific hypothesis input — this version is pure open-ended persona discovery, not "test this feature."
- No automatic/continuous re-aggregation — the cross-participant study report is generated on-demand when the PM requests it, not recomputed live after every interview.
- No scheduling, reminders, or incentive/payment handling.
- No mobile app — responsive web only.
- No live PM monitoring or mid-interview intervention.
- No automated post-interview thank-you email — postponed past MVP. Participant email is still captured (per Goals/partner framing), but no email is sent automatically for now; the PM would need to follow up manually if desired.
- No recording/data retention or deletion policy — out of scope for MVP. Data is kept indefinitely with no automated deletion; a retention policy is deferred to a later iteration.

## Core Concepts

- **Study**: created by the PM. Holds the target-profile description (industry, experience, title, seniority, responsibility) and one shareable link. A study can have many participants/interviews.
- **Participant / Interview**: one person's session within a study. Captures their name, email, self-described role/responsibility, and produces a transcript, audio recording, and individual AI summary.
- **Study Report**: an on-demand, PM-triggered cross-participant analysis across all completed interviews in a study, surfacing shared themes and pain-point frequency.

## Core User Flows

### 1. PM creates a study and gets a link

1. PM opens the dashboard, clicks "New Study."
2. PM fills a plain-English target profile: industry, years of experience, job title, seniority, and overall responsibility (free text, not rigid fields — but the form should prompt for these attributes to keep it consistent).
3. System generates one shareable link tied to that study. This link is reusable — the PM can send it to multiple people matching the target profile, and each person who opens it starts their own individual interview within the same study.
4. PM sends the link to target users via whatever channel they choose (email, Slack, etc. — outside this tool's scope).

### 2. Target user takes the interview

1. Target user opens the link in a browser.
2. Sees a short intro screen: briefly explains the study's purpose, that this is an AI-led voice interview, that it will be recorded (audio + transcript), and that their name/email will be used to follow up and share what's learned (framed as becoming a research partner, not just a subject).
3. Participant enters first name, email, and a brief description of their role/responsibility.
4. Participant gives explicit consent ("I agree, start interview") before the mic activates; grants mic permission.
5. AI voice agent greets the participant by name, references their stated role for context, and starts the interview.
6. Interviewer starts broad (context about their role/day-to-day), then narrows based on responses to surface and probe specific pain points — asking follow-ups, "tell me more," "walk me through the last time that happened," etc.
7. Interview ends when the AI judges it has reached sufficient depth on one or more pain points, or at a hard cap of 20 minutes, whichever comes first.
8. Target user sees a "Thank you, you're done" screen.

### 3. PM reviews individual results

1. Interview automatically transitions to "completed" once the session ends; transcript, AI-generated summary, and audio are processed and attached.
2. PM opens the dashboard, sees a list of studies, and within each study a list of participant interviews (name, status, date).
3. PM clicks into a completed interview to see: full transcript, AI summary (key pain points, notable quotes, general takeaways), and a playable audio recording.

### 4. PM generates a cross-participant study report

1. From a study's page (with one or more completed interviews), PM clicks "Generate study report."
2. System runs an LLM pass across all completed interviews' transcripts/summaries in that study.
3. Report surfaces shared themes/pain points across participants, how many participants raised each theme, and representative quotes.
4. PM can re-generate the report later as more interviews complete (manually triggered each time, not automatic).

## Interview Agent Behavior (Interviewing Technique Requirements)

- **Style**: Mom Test–aligned — ask about past behavior and specifics, not opinions or hypotheticals; avoid leading questions; avoid pitching or suggesting solutions.
- **Structure**: Broad opening (role, responsibilities, typical workflow — using the participant's self-described role as a starting anchor) → listen for friction signals → narrow in on the most promising thread(s) → probe for concrete specifics (frequency, impact, workarounds, last time it happened) → light wrap-up.
- **Depth heuristic**: The agent should not stop at a surface-level complaint; it should push one or two follow-up layers deep per pain point before either going deeper or pivoting to a new broad thread.
- **Termination**: Agent self-assesses when it has surfaced sufficient specific, concrete pain points; hard stop at 20 minutes regardless.
- **Tone**: Neutral, curious, conversational — not interrogative; brief acknowledgments, no long agent monologues.

## Data & Artifacts

### Per Study

- Target profile description (input)
- Shareable link
- Status (open / closed)
- Timestamps (created, closed)
- Study report (generated on demand; may be regenerated, latest version shown)

### Per Interview (Participant)

- First name, email, self-described role/responsibility (input)
- Full audio recording
- Full transcript (speaker-labeled)
- AI-generated individual summary (key pain points, notable quotes, takeaways)
- Status (pending / in-progress / completed / expired)
- Timestamps (created, started, completed)

## Consent & Privacy (MVP-level)

- Intro screen must clearly state: this is an AI-run voice interview, it is recorded (audio + transcript), name/email are collected to follow up and share findings, and data is reviewed by the requesting PM/team.
- Explicit consent action required before recording starts.
- Name/email are personal data — store and handle accordingly (no third-party sharing, access limited to the PM/team using the tool).
- Recordings/transcripts/participant contact info stored securely with no automated retention/deletion policy for MVP (kept indefinitely; policy design is explicitly out of scope for this iteration — see Non-Goals).

## Link Lifecycle

- Study link is multi-use/reusable — many participants can start independent interviews from the same link.
- Link becomes invalid when the PM manually closes the study, or automatically **7 days** after creation, whichever comes first.
- Invalid/closed-study links show a clear "this study is no longer accepting interviews" message.

## PM Authentication (MVP)

- Single-team MVP auth: email address + password login for the PM dashboard, via Supabase Auth. No org/multi-tenant accounts, no SSO.
- Password reset is included (Supabase Auth provides it with minimal extra work) — exact email template/UX is an implementation detail.

## Voice AI Stack Decision

The interview session runs on a pipelined voice architecture rather than a single-vendor speech-to-speech model, so each layer can be swapped independently:

| Layer           | Choice                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orchestration   | **Vapi**                                                                               | Handles audio transport, streaming glue between STT/LLM/TTS, turn-taking/interruption detection, backchanneling, and session/recording management. Bring-your-own-LLM model, so the interviewing logic isn't locked into a platform's built-in flow.                                                                                                                                                           |
| Interviewer LLM | **Claude Sonnet 4.6**, with prompt caching enabled on the growing conversation history | Runs the Mom Test–style interviewing prompt (broad→narrow steering, depth heuristic, self-assessed termination). Prompt caching keeps per-turn cost low as the transcript grows across a session.                                                                                                                                                                                                              |
| Speech-to-text  | **Deepgram Nova-3** (streaming)                                                        | Low-latency streaming transcription of the participant's audio, feeding the LLM as the participant talks. Nova-3 chosen as the best accuracy/latency balance for a live conversational interview (~$0.0077/min).                                                                                                                                                                                               |
| Text-to-speech  | **OpenAI TTS**, a neutral/professional default voice                                   | Voice for the interviewer's spoken responses. Chosen for cost — this is a research-interview tool, not a branded voice product, so ElevenLabs-level expressiveness isn't worth the price premium. Exact voice ID (e.g. one of OpenAI's default stock voices) to be picked by ear during implementation, but should read as calm/neutral, matching the "curious, conversational, not interrogative" tone below. |

**Design requirement — the interviewer LLM must be swappable.** The interviewing prompt/logic (Mom Test style, depth heuristic, termination judgment) is the core IP of this product, and model choice here is expected to change as models improve or costs shift. The backend should define an **LLM Provider Adapter**: a thin interface (e.g. `generateInterviewerTurn(conversationHistory, systemPrompt) → nextUtterance`) that Vapi's LLM webhook/config calls through, with the concrete provider (Claude Sonnet 4.6 today; Claude Opus, GPT-5-tier, or a future model later) injected via configuration, not hardcoded into the interview flow, dashboard, or summary-generation code. Swapping models should require changing one config value and re-validating the prompt — not touching call sites across the codebase. STT and TTS should be similarly pluggable via Vapi's provider configuration, but the LLM adapter is the priority since it's the layer most likely to change and the one carrying the product's actual behavior.

## Implementation Stack (MVP)

- **Frontend + backend**: Next.js (App Router, TypeScript) — one codebase for the PM dashboard, the participant-facing interview page, and API routes. No separate backend service for MVP.
- **Hosting**: Vercel.
- **Database**: Supabase (managed Postgres) for studies/interviews/summaries/PM account data. Chosen over a bare Postgres host because it also provides email/password auth out of the box, which covers the PM Authentication requirement above with minimal custom code.
- **Audio storage**: no dedicated object storage for MVP — the backend stores the Vapi-hosted recording URL/reference per interview rather than downloading and re-hosting audio itself. Revisit if/when Vapi's retention no longer meets the (currently out-of-scope) data-retention needs.

## System Components (high level, to be detailed in implementation planning)

1. **PM Dashboard (Next.js)** — create study (profile form) → generate link; list of studies; per-study list + detail view of participant interviews (transcript/summary/audio playback via the stored Vapi recording URL); "Generate study report" action and report view. Gated behind email/password login.
2. **Interview Session (Next.js, participant self-identifies)** — intro/name+email capture → consent screen → live voice interview UI → completion screen.
3. **Voice AI Agent** — Vapi orchestration + Claude Sonnet 4.6 (via a swappable LLM Provider Adapter, prompt caching enabled) + Deepgram STT + OpenAI TTS. See "Voice AI Stack Decision" above. Configured with the Mom Test–style interviewing behavior described earlier and the 20-minute cap.
4. **Backend/API (Next.js API routes)** — study & link management, session lifecycle, storing transcript + Vapi recording reference + participant data, triggering individual summary generation, triggering on-demand study report generation, PM login (email/password via Supabase Auth), serving dashboard data.
5. **Summary Generation** — LLM pass over a single transcript to produce the structured individual summary (pain points, quotes, takeaways). Uses the same LLM Provider Adapter as the interviewer, so it also swaps model via config.
6. **Study Report Generation** — LLM pass across multiple interviews' transcripts/summaries within a study to produce the cross-participant shared-themes report. Also goes through the LLM Provider Adapter.
7. **Database** — Supabase Postgres: studies, interviews/transcripts, summaries, participant contact info, PM accounts.

## Open Items for Implementation Planning (not blocking this blueprint)

- LLM Provider Adapter interface design (exact method signature, how conversation history/system prompt are passed, how Vapi's LLM webhook target maps to it) — to be detailed in implementation planning.
- Exact OpenAI TTS voice ID — to be picked by ear during implementation (neutral/professional default confirmed above).
- Password reset email template/UX (mechanism confirmed above; content/design not specced).
- Database schema design (tables/columns for Study, Interview, Summary, Study Report, PM account) — to be detailed in implementation planning.
