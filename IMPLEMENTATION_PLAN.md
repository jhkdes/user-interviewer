# AI Voice User-Interviewer — Modular Design & Implementation Tickets

Companion to [REQUIREMENTS.md](REQUIREMENTS.md) (what to build) and [GLOSSARY.md](GLOSSARY.md) (terms). This document covers **how it's decomposed into modules** and **the tickets to build it in testable, milestone-sized steps**.

## How to use this document

- Each **module** below has a single responsibility, a defined interface, and an explicit test strategy — build it against that interface before wiring it to real infrastructure (Vapi, Claude, Supabase), so tests don't depend on live services.
- Tickets are grouped into **milestones**. Within a milestone, tickets are meant to be done in order; across milestones, later ones depend on earlier ones as noted.
- Every ticket that produces logic (not pure UI wiring) should be written test-first: write the failing test against the module's interface, then implement.

---

## Module Map

| Module                                                                                                    | Responsibility                                                                                                                                                   | Depends on                                                                   | Test strategy                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Domain Types**                                                                                          | Shared TypeScript types/enums for Study, Interview, Summary, StudyReport, PMAccount and their statuses                                                           | none                                                                         | Type-level only; no runtime tests needed                                                                                                                                                                       |
| **Repositories** (`StudyRepository`, `InterviewRepository`, `SummaryRepository`, `StudyReportRepository`) | CRUD + queries against Supabase, hidden behind an interface per entity                                                                                           | Domain Types, Supabase client                                                | Unit tests against an in-memory fake implementing the same interface; separate integration tests against a real (test) Supabase instance                                                                       |
| **LLM Provider Adapter**                                                                                  | Single interface (`generateInterviewerTurn`, `generateSummary`, `generateStudyReport`) with a Claude Sonnet 4.6 implementation behind it                         | none (Anthropic SDK only)                                                    | Unit tests with the Anthropic client mocked (verify request shape, prompt-caching config, error handling); a `FakeLLMProvider` implementing the same interface is exported for every downstream module's tests |
| **Interview Agent**                                                                                       | Pure interviewing logic: builds the Mom Test system prompt from a target profile, decides the next utterance via the LLM adapter, tracks depth/termination state | LLM Provider Adapter (interface only, injected)                              | Unit tests using `FakeLLMProvider` with scripted responses — no network calls                                                                                                                                  |
| **Study & Link Service**                                                                                  | Create/close studies, generate/validate/expire shareable links                                                                                                   | Repositories                                                                 | Unit tests with fake repository                                                                                                                                                                                |
| **Participant Intake Service**                                                                            | Validate name/email/role input, record consent, create an Interview record                                                                                       | Repositories                                                                 | Unit tests with fake repository; pure validation logic tested standalone                                                                                                                                       |
| **Voice Session Orchestrator**                                                                            | Vapi webhook handlers — routes call/session events to the Interview Agent, enforces the 20-minute cap, drives interview status transitions                       | Interview Agent, Repositories, Vapi SDK/webhook payloads                     | Unit tests with fake Vapi event payloads and `FakeLLMProvider`; a manual/live test against real Vapi is the milestone's acceptance step, not a unit test                                                       |
| **Summary Service**                                                                                       | Turns a completed interview's transcript into a structured individual summary via the LLM adapter                                                                | LLM Provider Adapter, Repositories                                           | Unit tests with `FakeLLMProvider`                                                                                                                                                                              |
| **Study Report Service**                                                                                  | Aggregates multiple interviews' transcripts/summaries into a cross-participant report via the LLM adapter                                                        | LLM Provider Adapter, Repositories                                           | Unit tests with `FakeLLMProvider`                                                                                                                                                                              |
| **PM Auth**                                                                                               | Supabase Auth wrapper — login, session/route protection, password reset                                                                                          | Supabase client                                                              | Unit tests for any wrapper logic; login/reset UX itself verified manually (thin wrapper around a managed service)                                                                                              |
| **PM Dashboard UI**                                                                                       | Next.js pages/components: study creation, study list, interview detail, report view                                                                              | Services above (via API routes)                                              | Component tests for logic-bearing components (e.g. form validation); manual check for layout                                                                                                                   |
| **Participant UI**                                                                                        | Next.js pages: intro/consent, live interview (Vapi web SDK), completion, expired-link screens                                                                    | Study & Link Service, Participant Intake Service, Voice Session Orchestrator | Component tests for validation/consent gating; manual check for the live call UI (can't meaningfully unit-test a live mic session)                                                                             |

### Dependency order (build bottom-up)

```
Domain Types
   │
   ├──> Repositories ──────────────────────────┐
   │                                            │
   └──> LLM Provider Adapter                    │
              │                                 │
              ▼                                 ▼
        Interview Agent                 Study & Link Service
              │                         Participant Intake Service
              ▼                                 │
   Voice Session Orchestrator <──────────────────┘
              │
              ▼
   Summary Service ──> Study Report Service
              │
              ▼
   PM Auth ──> PM Dashboard UI
              │
   Participant UI
```

The **LLM Provider Adapter** and **Interview Agent** are the modules to get right first and keep cleanest — they're both the core interviewing logic and the piece most likely to change providers later. Everything downstream of them should only ever talk to the `LLMProviderAdapter` interface, never to the Anthropic SDK directly.

---

## Milestones & Tickets

### M0 — Project Scaffolding

| ID   | Title                                                                                                                                               | Depends on |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T0.1 | Initialize Next.js (App Router, TypeScript) project; configure ESLint/Prettier and a test runner (Vitest recommended — fast, native TS/ESM support) | —          |
| T0.2 | Set up Supabase project (dev + test instances); add connection config via env vars                                                                  | —          |
| T0.3 | Set up CI (GitHub Actions or equivalent) running lint + unit tests on every push                                                                    | T0.1       |

**Acceptance:** `npm test` runs a trivial passing test in CI; app boots locally with `npm run dev`.

---

### M1 — Domain Model & Data Layer

| ID   | Title                                                                                                                                                                                     | Depends on |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T1.1 | Define domain types: `Study`, `Interview`, `Summary`, `StudyReport`, `PMAccount`, and status enums (`StudyStatus`, `InterviewStatus`) per the Data & Artifacts section of REQUIREMENTS.md | T0.1       |
| T1.2 | Write Supabase SQL migrations for the corresponding tables (studies, interviews, summaries, study_reports; PM accounts via Supabase Auth)                                                 | T1.1, T0.2 |
| T1.3 | Define `StudyRepository` and `InterviewRepository` interfaces (create/get/list/update methods) and an in-memory fake implementation of each, exported for use in later tests              | T1.1       |
| T1.4 | Implement Supabase-backed `StudyRepository` and `InterviewRepository`; integration tests against the test Supabase instance                                                               | T1.2, T1.3 |
| T1.5 | Repeat T1.3/T1.4 for `SummaryRepository` and `StudyReportRepository`                                                                                                                      | T1.2       |

**Acceptance:** Every repository has a passing test suite against both the fake and the real (test-DB) implementation, proving they satisfy the same interface.

---

### M2 — LLM Provider Adapter

| ID   | Title                                                                                                                                                                                                                                | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| T2.1 | Define `LLMProviderAdapter` interface: `generateInterviewerTurn(history, systemPrompt) → utterance`, `generateSummary(transcript) → Summary`, `generateStudyReport(transcripts[]) → StudyReport`                                     | T0.1       |
| T2.2 | Implement `ClaudeSonnet46Adapter` using the Anthropic SDK, with prompt caching enabled on the growing conversation history                                                                                                           | T2.1       |
| T2.3 | Unit tests for `ClaudeSonnet46Adapter` with the Anthropic client mocked — verify request shape, that `cache_control` is set correctly, and error/timeout handling                                                                    | T2.2       |
| T2.4 | Build `FakeLLMProvider` (scriptable canned responses) implementing the same interface, exported for all downstream module tests                                                                                                      | T2.1       |
| T2.5 | Wire adapter selection via config (env var naming the provider) so a future provider can be added without touching call sites — write a test that swaps in a second dummy provider via config and confirms call sites are unaffected | T2.2, T2.4 |

**Acceptance:** Interview Agent, Summary Service, and Study Report Service (built next) never import the Anthropic SDK directly — only `LLMProviderAdapter`.

---

### M3 — Interview Agent (core interviewing logic)

| ID   | Title                                                                                                                                                                               | Depends on                    |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| T3.1 | System prompt builder: pure function `buildInterviewSystemPrompt(targetProfile) → string`, encoding the Mom Test style, broad→narrow structure, and tone rules from REQUIREMENTS.md | T2.1                          |
| T3.2 | Depth/termination tracker: pure function(s) that, given conversation-so-far, signal "keep probing," "pivot to new thread," or "terminate" per the depth heuristic                   | T3.1                          |
| T3.3 | Interview Agent orchestrator combining T3.1 + T3.2 + `LLMProviderAdapter` to produce the next utterance and a termination decision each turn                                        | T3.1, T3.2, `FakeLLMProvider` |
| T3.4 | Unit tests driving T3.3 through a scripted multi-turn conversation via `FakeLLMProvider`, asserting it probes before pivoting and terminates appropriately                          | T3.3                          |

**Acceptance:** The full interviewing behavior (broad opening → probing → depth heuristic → termination) is demonstrated in tests with zero live LLM calls.

---

### M4 — Study & Link Management

| ID   | Title                                                                                                                                       | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T4.1 | `createStudy(profile) → Study` use-case: validates the target-profile fields, persists via `StudyRepository`, generates a unique link token | T1.3       |
| T4.2 | Link validation logic: pure function checking a link token against study status + 7-day expiry from `created_at`                            | T4.1       |
| T4.3 | `closeStudy(studyId)` use-case                                                                                                              | T4.1       |
| T4.4 | API routes: `POST /api/studies`, `GET /api/studies`, `GET /api/studies/:id`, `POST /api/studies/:id/close`                                  | T4.1–T4.3  |

**Acceptance:** Unit tests cover valid/invalid profile input, expired/closed/valid link states, using the fake repository.

---

### M5 — Participant Intake

| ID   | Title                                                                                                                                                                       | Depends on       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| T5.1 | Intake validation: pure function checking first name / email format / role blurb presence                                                                                   | —                |
| T5.2 | `startInterview(studyId, participantInfo) → Interview` use-case: validates link (T4.2), captures consent timestamp, creates an `Interview` record via `InterviewRepository` | T4.2, T1.3, T5.1 |
| T5.3 | API route: `POST /api/studies/:linkToken/interviews`                                                                                                                        | T5.2             |

**Acceptance:** Unit tests cover rejecting an expired/closed link, rejecting invalid intake fields, and successful creation with the fake repository.

---

### M6 — Voice Session Orchestration (Vapi Integration)

| ID   | Title                                                                                                                                                                                                              | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| T6.1 | Vapi webhook route skeleton (`POST /api/vapi/webhook`) parsing Vapi's event payload shapes                                                                                                                         | T0.1       |
| T6.2 | Wire Vapi's custom-LLM webhook target to call the Interview Agent (T3.3) per turn, returning the next utterance in Vapi's expected response shape                                                                  | T3.3, T6.1 |
| T6.3 | Interview status state machine driven by Vapi events: `pending → in-progress → completed` (and `expired` for unused links, from T4.2)                                                                              | T5.2, T6.1 |
| T6.4 | Enforce the 20-minute hard cap — force termination if Vapi hasn't ended the call by then                                                                                                                           | T6.2       |
| T6.5 | Unit tests for T6.1–T6.4 using fake Vapi event payloads and `FakeLLMProvider`                                                                                                                                      | T6.1–T6.4  |
| T6.6 | **Manual acceptance test**: real Vapi call end-to-end against a live (sandboxed) Claude/Deepgram/OpenAI TTS stack — confirm turn-taking, interruption handling, and the 20-minute cap actually work in a live call | T6.1–T6.5  |

**Acceptance:** T6.5 passes with no network calls; T6.6 is manually verified once and documented (not automated in MVP).

---

### M7 — Transcript Capture & Individual Summary Generation

| ID   | Title                                                                                                                                             | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T7.1 | On call completion, store the speaker-labeled transcript and the Vapi-hosted recording URL against the `Interview` record                         | T6.3       |
| T7.2 | `generateIndividualSummary(interviewId)` use-case: loads transcript, calls `LLMProviderAdapter.generateSummary`, persists via `SummaryRepository` | T2.5, T1.5 |
| T7.3 | Trigger T7.2 automatically when an interview transitions to `completed`                                                                           | T7.1, T7.2 |
| T7.4 | Unit tests for T7.2 with `FakeLLMProvider` and fake repositories                                                                                  | T7.2       |

**Acceptance:** Completing a fake interview in tests results in a persisted summary with no live LLM call.

---

### M8 — Study Report Generation

| ID   | Title                                                                                                                                                                                                                   | Depends on |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T8.1 | `generateStudyReport(studyId)` use-case: loads all completed interviews' transcripts/summaries in a study, calls `LLMProviderAdapter.generateStudyReport`, persists via `StudyReportRepository` (new version each call) | T2.5, T1.5 |
| T8.2 | API route: `POST /api/studies/:id/report` (on-demand trigger)                                                                                                                                                           | T8.1       |
| T8.3 | Unit tests for T8.1 with `FakeLLMProvider`, including the case of a study with only one completed interview                                                                                                             | T8.1       |

**Acceptance:** Report generation is demonstrated in tests across a multi-interview fake study with zero live LLM calls.

---

### M9 — PM Authentication

| ID   | Title                                                                                                  | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------ | ---------- |
| T9.1 | Wire Supabase Auth (email/password) for PM login                                                       | T0.2       |
| T9.2 | Route protection middleware — all `/dashboard/*` routes and PM-only API routes require a valid session | T9.1       |
| T9.3 | Password reset flow (Supabase-provided) wired into the app's UI                                        | T9.1       |

**Acceptance:** Manual verification of login, logout, protected-route redirect, and password reset (thin wrapper around a managed service — not worth heavy unit testing).

---

### M10 — PM Dashboard UI

| ID    | Title                                                                                    | Depends on |
| ----- | ---------------------------------------------------------------------------------------- | ---------- |
| T10.1 | "New Study" form → calls T4.4's create endpoint → displays the generated link            | T4.4, T9.2 |
| T10.2 | Study list view                                                                          | T4.4, T9.2 |
| T10.3 | Study detail view: list of interviews with status/date                                   | T4.4, T9.2 |
| T10.4 | Interview detail view: transcript, individual summary, audio player (Vapi recording URL) | T7.1, T7.2 |
| T10.5 | Study report view + "Generate study report" button wired to T8.2                         | T8.2       |

**Acceptance:** Form validation logic (T10.1) covered by component tests; the rest verified manually against the live dev stack.

---

### M11 — Participant-Facing UI

| ID    | Title                                                                                  | Depends on  |
| ----- | -------------------------------------------------------------------------------------- | ----------- |
| T11.1 | Intro/consent screen (study purpose, recording disclosure, "I agree, start interview") | T5.3        |
| T11.2 | Name/email/role intake form                                                            | T5.3, T11.1 |
| T11.3 | Live interview UI — Vapi web SDK integration, mic permission, call status display      | T6.2, T11.2 |
| T11.4 | Completion screen                                                                      | T6.3        |
| T11.5 | Expired/invalid-link screen                                                            | T4.2        |

**Acceptance:** Intake form validation (T11.2) covered by component tests; the live call UI (T11.3) verified manually since it requires a real mic/audio session.

---

### M12 — End-to-End MVP Acceptance

| ID                                  | Title                                                                                                                                                                                                                                 | Depends on |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| T12.1                               | **Manual E2E walkthrough**: PM logs in → creates a study → copies the link → participant opens link, consents, completes a real voice interview → summary appears in dashboard → PM generates a study report after a second interview | All above  |
| T12.2 _(stretch, not MVP-blocking)_ | Automate the critical path with Playwright (PM login → study creation → link generation; participant intake validation) — the live voice call itself is out of scope for automation                                                   | T12.1      |

**Acceptance:** T12.1 completed and any issues found are filed as follow-up tickets. This is the MVP "done" gate.

---

## Notes on TDD discipline

- **Pure logic first** (T3.1, T3.2, T4.2, T5.1) has no external dependencies — write these test-first with no mocks needed at all; they're the highest-leverage place to practice strict TDD.
- **Adapters and orchestrators** (LLM adapter, Vapi webhook handler) should be tested against fakes/mocks of the external SDK, never the real service, so the suite stays fast and doesn't burn API credits on every run.
- **Repositories** get two test suites deliberately: one against the in-memory fake (fast, runs everywhere) and one integration suite against a real test database (slower, catches actual SQL/schema issues) — both should pass before a repository ticket is considered done.
- **UI** is tested at the level where logic actually lives (form validation, gating), not for pixel-level layout — live/manual verification is the right tool for the actual call experience and visual review.
