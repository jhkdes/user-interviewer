# Implementation Progress Log

Tracks milestone completion against [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — what's done, what tests were run and their results, and any deviations from the plan (with reasoning) so decisions aren't lost. Update this file at the end of each milestone.

## Status Overview

| Milestone                                    | Status         | Date       |
| -------------------------------------------- | -------------- | ---------- |
| M0 — Project Scaffolding                     | ✅ Complete    | 2026-08-18 |
| M1 — Domain Model & Data Layer               | ✅ Complete    | 2026-08-18 |
| M2 — LLM Provider Adapter                    | ✅ Complete    | 2026-08-18 |
| M3 — Interview Agent                         | ✅ Complete    | 2026-08-18 |
| M4 — Study & Link Management                 | ✅ Complete    | 2026-08-18 |
| M5 — Participant Intake                      | ✅ Complete    | 2026-08-19 |
| M6 — Voice Session Orchestration             | ✅ Complete    | 2026-08-23 |
| M7 — Transcript Capture & Individual Summary | ✅ Complete    | 2026-08-22 |
| M8 — Study Report Generation                 | ✅ Complete    | 2026-08-22 |
| M9 — PM Authentication                       | ✅ Complete    | 2026-08-22 |
| M10 — PM Dashboard UI                        | ✅ Complete    | 2026-08-22 |
| M11 — Participant-Facing UI                  | ✅ Complete    | 2026-08-23 |
| M12 — End-to-End MVP Acceptance              | ⬜ Not started |            |
| M13 — Participant Experience Refinements     | ✅ Complete    | 2026-08-24 |

---

## M0 — Project Scaffolding ✅ (2026-08-18)

### Tickets completed

- **T0.1** — Next.js 14 (App Router, TypeScript, Tailwind) scaffolded; Vitest test runner added; Prettier + ESLint configured with `format`/`format:check` scripts.
- **T0.2** — Supabase client scaffolding: `src/lib/supabase/client.ts` (`createServerSupabaseClient`, service-role, server-only) with env-var validation; `.env.example` template added. _Actual Supabase project (dev + test) creation is a manual step — not done yet, see Open Follow-Ups below._
- **T0.3** — GitHub Actions CI workflow added (`.github/workflows/ci.yml`): lint, typecheck, format check, test, on push/PR to `main`. _Inert until a GitHub remote exists — see Open Follow-Ups._

### Tests run

| Command                               | Result                                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest)                   | ✅ 2 test files, 4 tests passed — sanity test + `createServerSupabaseClient` (missing-`SUPABASE_URL`, missing-`SUPABASE_SERVICE_ROLE_KEY`, and happy-path construction) |
| `npm run lint` (`next lint`)          | ✅ No ESLint warnings or errors                                                                                                                                         |
| `npx tsc --noEmit`                    | ✅ No type errors                                                                                                                                                       |
| `npm run format:check` (Prettier)     | ✅ All files match Prettier style                                                                                                                                       |
| `npm run dev` + `curl localhost:3000` | ✅ Boots, returns HTTP 200                                                                                                                                              |

### Deviations from plan / decisions made

1. **Node.js upgraded 18.17.1 → 20.18.0.** Vitest 4, current ESLint tooling, and `@supabase/supabase-js` all now require Node ≥20 (some sub-packages target ≥22). Installed via nvm-windows. Required a VS Code restart mid-session for the updated `PATH` to propagate to spawned shells — plain `npm install` fails partway through (child processes can't resolve `node`) until that restart happens.
2. **Vitest pinned to `^2.1.9`, not latest (`^4.x`).** Vitest 4 uses a Rolldown-based Vite build that imports `node:util`'s `styleText`, which doesn't exist before Node 20.19/22 — it hard-crashes on startup on our Node 20.18.0. v2.x doesn't have this dependency and runs cleanly.
3. **`ws` polyfill added for the Supabase client.** `@supabase/supabase-js`'s realtime module probes for a native `WebSocket` at client construction time (unrelated to whether realtime features are used) and throws if one isn't found — which requires Node ≥22. Rather than force another Node upgrade or pin to an older, soon-unsupported SDK version, `createServerSupabaseClient` passes `ws` explicitly via `realtime: { transport: WebSocket }`. This is Supabase's documented workaround and keeps us on the current SDK version regardless of which Node version ends up running in production.
4. **Package name fixed.** `create-next-app` was scaffolded into a temp subdirectory (`scaffold-tmp`) to avoid conflicting with the existing `REQUIREMENTS.md`/`GLOSSARY.md`/`IMPLEMENTATION_PLAN.md` files, then merged into the project root. This left `package.json`'s `name` field as `"scaffold-tmp"`; corrected to `"user-interviewer"`.
5. **`.gitattributes` added** (`* text=auto eol=lf`) to normalize line endings after Git warned about LF→CRLF conversion on Windows during the initial commit.

### Open follow-ups (not blocking, need you)

- ~~Create the actual Supabase project(s) and populate `.env.local`.~~ Done — see M1.
- ~~Push the repo to a GitHub remote so CI runs.~~ Done — pushed to [jhkdes/user-interviewer](https://github.com/jhkdes/user-interviewer).

---

## M1 — Domain Model & Data Layer ✅ (2026-08-18)

### Tickets completed

- **T1.1** — Domain types added under `src/domain/`: `Study`/`TargetProfile`/`StudyStatus`, `Interview`/`TranscriptEntry`/`InterviewStatus`, `Summary`, `StudyReport`/`StudyReportTheme`, `PMAccount` (identity only — no custom table, backed by Supabase Auth).
- **T1.2** — SQL migration `supabase/migrations/0001_init.sql`: `studies`, `interviews`, `summaries`, `study_reports` tables, with FK cascade deletes, status check constraints, and a `unique (study_id, version)` constraint on `study_reports`. Applied to a real Supabase test project and verified — see below.
- **T1.3** — `StudyRepository` and `InterviewRepository` interfaces (`src/repositories/*.ts`) plus in-memory fake implementations (`src/repositories/in-memory/`).
- **T1.4** — `SupabaseStudyRepository` and `SupabaseInterviewRepository` (`src/repositories/supabase/`), mapping snake_case DB rows to domain types.
- **T1.5** — Same interface/fake/Supabase-impl pattern repeated for `SummaryRepository` and `StudyReportRepository` (the latter computes `version` server-side, incrementing per study).

**Design choice beyond the plan:** each repository's test suite is written once as a shared "contract test" (`src/repositories/contract-tests/*.contract.ts`) and run against _both_ the in-memory fake and the real Supabase-backed implementation, so the two are proven to satisfy identical behavior instead of hand-writing two divergent test suites per repository.

### Tests run

| Command                                                      | Result                                                                                                             |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `npm test` (Vitest, no Supabase env)                         | ✅ 26 tests passed — 22 Supabase integration tests **skipped** (no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` set) |
| `npm test` (Vitest, pointed at a real Supabase test project) | ✅ 48 tests passed, 0 skipped, 0 failed — first two attempts surfaced real bugs, see Deviations #5/#6 below        |
| `npm run lint` (`next lint`)                                 | ✅ No ESLint warnings or errors                                                                                    |
| `npx tsc --noEmit`                                           | ✅ No type errors                                                                                                  |
| `npm run format:check` (Prettier)                            | ✅ All files match Prettier style                                                                                  |

### Deviations from plan / decisions made

1. **`tsconfig.json` needed an explicit `"target": "ES2020"`.** The scaffolded config had no `target`, which defaults to ES3 — iterating a `Map`'s `.values()` (used in the in-memory repositories) doesn't compile without at least ES2015. Also had to clear a stale `tsconfig.tsbuildinfo` once after the change (incremental build cache masked the fix on the first re-run).
2. **`vitest.config.ts` needed an explicit `@` path alias.** TypeScript resolves `@/*` via `tsconfig.json` `paths`, but Vitest (Vite) doesn't read that automatically — repository/domain imports failed at test-run time until `resolve.alias` was added pointing `@` at `./src`.
3. **Contract-test factories are `() => T | Promise<T>`, not just `() => T`.** The Supabase-backed integration tests need to async-clean relevant tables before each test hands back a repository instance (so, e.g., `list()` assertions aren't polluted by rows left over from a prior run or a prior test). Every `it()` in the shared contract tests now `await`s the factory.
4. **Foreign-key IDs (`studyId`, `interviewId`) are passed to contract tests as getters (`() => string`), not plain strings.** The Supabase suites create their fixture study/interview in `beforeAll`, which hasn't run yet at the point the contract-test function synchronously registers its `it()` blocks — a plain string parameter would capture `undefined`.
5. **Two real bugs surfaced once actually run against a live Supabase test project** (not caught by the in-memory suite or by compiling/skipping cleanly — this is exactly why "unverified against a real DB" was flagged as the top risk):
   - **Cross-file test pollution.** Vitest runs test files in parallel by default. All four Supabase integration test files share one live database; the study-repository file's per-test cleanup (`delete from studies` before each of its own tests) was deleting fixture studies that the interview/summary/study-report files had just created in their own `beforeAll` — cascading to delete their interviews too, and surfacing as foreign-key-violation errors on `create()` calls that should have succeeded. Fixed by setting `fileParallelism: false` in `vitest.config.ts` — integration tests against a shared external resource need to run serially; only the parallelism was wrong, not the schema or the repository code.
   - **Non-UUID placeholder IDs in "not found" tests.** Tests used arbitrary strings like `"does-not-exist"` for "assert this lookup returns null" cases. That's a valid fake ID against the in-memory Map-based fakes, but Postgres `uuid`-typed columns reject non-UUID-formatted input as a hard query error rather than "no rows" — so these tests threw instead of asserting `null`. Fixed by introducing a shared `NONEXISTENT_ID` constant (a well-formed, never-generated UUID) in `src/repositories/contract-tests/nonexistent-id.ts`, used everywhere a contract test needs an id that provably doesn't exist. Works identically against both implementations.
6. **Migration SQL is now applied and verified** against a real Supabase test project — `supabase/migrations/0001_init.sql` matches the domain model and all constraints (FK cascades, status checks, `unique (study_id, version)`) behave as intended.

### Open follow-ups (not blocking, need you)

- None outstanding for M1. Supabase project creation and migration application (carried over from M0) are done.

---

## M2 — LLM Provider Adapter ✅ (2026-08-18)

### Tickets completed

- **T2.1** — `LLMProviderAdapter` interface (`src/llm/types.ts`): `generateInterviewerTurn`, `generateSummary`, `generateStudyReport`, plus the input/output types each depends on (`InterviewTurn`, etc.).
- **T2.2** — `ClaudeSonnet46Adapter` (`src/llm/claude-sonnet-4-6-adapter.ts`) using the Anthropic SDK against `claude-sonnet-4-6`, with prompt caching on the system prompt and the growing conversation history (cache_control on the last message each call), and structured outputs (`output_config.format`) for all three methods so responses are always parseable JSON rather than free text to regex out.
- **T2.3** — Unit tests (`src/llm/__tests__/claude-sonnet-4-6-adapter.test.ts`, 11 tests) with the Anthropic client mocked — request shape, cache_control placement, role mapping, structured-output config, and error/parse-failure handling.
- **T2.4** — `FakeLLMProvider` (`src/llm/fake-llm-provider.ts`): scriptable canned responses + call recording, exported for every downstream module (Interview Agent, Summary Service, Study Report Service) to use in their own tests without hitting the network.
- **T2.5** — `getLLMProvider()` (`src/llm/get-llm-provider.ts`): resolves the active adapter from the `LLM_PROVIDER` env var against an injectable registry, defaulting to Claude Sonnet 4.6. Test proves a second (dummy) provider can be swapped in via config with the exact same call-site code — see Design choice below.

**Design choices beyond the plan:**

- **Provider registry is injectable, not a mutated module-level singleton.** `getLLMProvider(env, registry)` takes both as optional parameters (defaulting to `process.env` and the real registry). This lets the swap-provider test construct its own registry rather than mutating shared global state, which would risk leaking a test's fake provider registration into other test files.
- **A live integration test suite was added beyond the ticket's scope** (`claude-sonnet-4-6-adapter.integration.test.ts`), following the same pattern M1 established for Supabase: skips cleanly without `ANTHROPIC_API_KEY`, otherwise makes real calls to all three methods and asserts the response shape. Added proactively because M1 showed that mocked/fake tests passing doesn't mean the real API accepts the request shape. **Run and passing against the real API** — see Tests run below; unlike M1, the request shape (structured outputs, `output_config`, `claude-sonnet-4-6` model id, cache_control) was correct on the first live run, no fixes needed.
- **The adapter, not the caller, handles Claude's "first message must be user" constraint.** In a voice interview the interviewer speaks first; `buildInterviewMessages` prepends a synthetic user turn when history is empty or starts with the interviewer, so the Interview Agent (M3) can track conversation history in the natural order without knowing about this Claude-specific API rule.

### Tests run

| Command                                                                  | Result                                                                                             |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no Anthropic/Supabase env)                           | ✅ 46 tests passed — 26 integration tests (22 Supabase + 4 Claude) **skipped**, no credentials set |
| `npm test` (Vitest, real Supabase test project + real Anthropic API key) | ✅ **72/72 passed, 0 skipped, 0 failed** — Claude integration suite took ~22s                      |
| `npm run lint` (`next lint`)                                             | ✅ No ESLint warnings or errors                                                                    |
| `npx tsc --noEmit`                                                       | ✅ No type errors                                                                                  |
| `npm run format:check` (Prettier)                                        | ✅ All files match Prettier style                                                                  |

### Open follow-ups (not blocking, need you)

- None outstanding for M2.

---

## M3 — Interview Agent ✅ (2026-08-18)

### Tickets completed

- **T3.1** — `buildInterviewSystemPrompt` (`src/interview-agent/system-prompt.ts`): pure function encoding the Mom Test style, broad→narrow structure, depth heuristic, and tone rules from REQUIREMENTS.md, parameterized by the participant's name/self-described role and the study's target profile.
- **T3.2** — `checkTermination` (`src/interview-agent/termination.ts`): pure function applying two deterministic guardrails on top of the LLM's own self-assessment — the hard 20-minute cap, and a minimum-participant-turns floor before the LLM's "end it" signal is honored (guards against ending after one surface-level exchange).
- **T3.3** — `InterviewAgent` (`src/interview-agent/interview-agent.ts`): stateless orchestrator combining T3.1 + T3.2 + the `LLMProviderAdapter` from M2 — builds the prompt, calls `generateInterviewerTurn`, applies the termination check, returns the utterance plus an end-of-interview decision.
- **T3.4** — Unit tests (`interview-agent.test.ts`) driving `InterviewAgent` through a scripted 5-turn conversation via `FakeLLMProvider`, asserting it doesn't end early on shallow turns and does terminate once the LLM self-assesses after sufficient depth.

**Design choice beyond the plan — termination is two-state (continue / terminate), not three-state:** the original module map described `checkTermination`-equivalent logic as signaling "keep probing," "pivot to new thread," or "terminate." Distinguishing "still worth probing this thread" from "time to pivot" is a genuine judgment call about conversation content — attempting it with pure heuristics (e.g. topic clustering on transcript text) would be unreliable and is exactly the kind of nuanced judgment M2's design already delegates to the LLM (via the depth-heuristic instructions in the system prompt and the `shouldEndInterview` signal). `checkTermination` only enforces the two things that must never depend on the LLM getting it right: the hard time cap, and not ending too early. Probing-vs-pivoting is left entirely to the LLM's judgment, as designed.

**Bug found and fixed during T3.4 (worth noting for future test authors):** the multi-turn test builds conversation history by `push`-ing into an array across loop iterations and passing that same array into each call. `FakeLLMProvider` was storing the array _reference_ in `calls`, so by the end of the loop every recorded call pointed at the same, fully-grown array — assertions on "what history did call N actually see" were silently wrong (all showed the final length). Fixed by making `FakeLLMProvider` `structuredClone()` every input it records, in `src/llm/fake-llm-provider.ts`. This is a general robustness fix, not just a fix for this one test — any future test that mutates a shared history/array after calling the fake would have hit the same silent bug.

### Tests run

| Command                              | Result                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 68 tests passed (22 new: 6 system-prompt + 7 termination + 6 interview-agent + 3 adapter retry/validation) — 26 integration tests skipped, no credentials set |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                                                  |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                                                |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                                                |

**Correction to an earlier claim in this entry:** it originally said no live-service testing was needed for M3 since `InterviewAgent` only calls the already-verified `LLMProviderAdapter` interface. That was wrong — see Manual verification below.

### Manual verification (real bug found)

Added `scripts/try-interview-agent.ts` (`npm run try:interview-agent`) — an interactive CLI where a person plays the participant against the real `InterviewAgent` + Claude, since `FakeLLMProvider`-driven unit tests can't judge actual interviewing quality. Running a real interview through it surfaced a genuine bug: **Claude occasionally returned a literal `"..."` as the utterance** — valid JSON, so structured-output parsing succeeded and nothing threw; the degenerate text just silently reached the transcript. Notably, this also would have passed the M2 integration test's assertion (`utterance.length > 0`), since `"..."` has length 3.

Fixed in `ClaudeSonnet46Adapter.generateInterviewerTurn`:

- Added `isMeaningfulUtterance()` validation (rejects text with no alphabetic characters) and a bounded retry (2 attempts) — a degenerate first response triggers one retry before giving up with a clear error, rather than ever handing garbage to a live participant.
- Strengthened both the system prompt (`system-prompt.ts`) and the `utterance` field's schema description (`schemas.ts`) to explicitly instruct against placeholder/ellipsis/blank output — defense in depth alongside the code-level check, since prompt instructions alone clearly aren't 100% reliable.

This is the same lesson M1 and M2 already taught in different forms: logic correctness (proven by fake/mocked tests) and real-world behavior correctness (only provable by actually running the live thing) are genuinely different questions, and this milestone needed both.

### Open follow-ups (not blocking, need you)

- Re-run `npm run try:interview-agent` (and/or the M2 live integration suite) a few more times against the real API to build confidence the retry fix actually resolves the degenerate-utterance issue in practice — one manual run isn't a statistically meaningful sample for a probabilistic model behavior.

---

## M4 — Study & Link Management ✅ (2026-08-18)

### Tickets completed

- **T4.1** — `createStudy(repo, input)` use-case (`src/study-service/create-study.ts`): validates the target profile via T-below, generates a link token, persists via `StudyRepository`. Throws `InvalidTargetProfileError` (carrying the field-level errors) rather than persisting a partial/invalid study.
- **T4.2** — `checkLinkValidity(study, now)` (`src/study-service/link-validity.ts`): pure function returning `"valid" | "closed" | "expired"` — closed status always wins, otherwise expiry is computed as `createdAt + 7 days` rather than stored, so it's always correct without a background job. Also added `validateTargetProfile` (`target-profile-validation.ts`, required-field check per REQUIREMENTS.md's five profile fields) and `generateLinkToken` (`link-token.ts`, `crypto.randomBytes(24)` base64url) as the supporting pure pieces T4.1 depends on.
- **T4.3** — `closeStudy(repo, studyId)` (`src/study-service/close-study.ts`): thin wrapper over `StudyRepository.updateStatus`.
- **T4.4** — API routes: `POST /api/studies`, `GET /api/studies` (`src/app/api/studies/route.ts`); `GET /api/studies/:id` (`src/app/api/studies/[id]/route.ts`); `POST /api/studies/:id/close` (`src/app/api/studies/[id]/close/route.ts`). `getStudyRepository()` (`src/repositories/get-study-repository.ts`) resolves the live Supabase-backed repository for route handlers, mirroring M2's `getLLMProvider()` pattern.

### Tests run

| Command                              | Result                                                                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 82 tests passed (14 new: 4 validation + 5 link-validity + 3 create-study + 2 close-study) — 26 integration tests skipped, no credentials set |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                                 |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                               |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                               |
| `npm run build`                      | ✅ Compiles; all three `/api/studies*` routes register as dynamic (`ƒ`), not static                                                             |

### Manual verification against a real Supabase test project (real bug found)

Added `scripts/try-study-api.ts` (`npm run try:study-api`) — a scripted create → list → get → 400 → 404 → close → get walkthrough against a running `npm run dev`, since the M1 lesson (fake/mocked tests passing ≠ real service behaving correctly) applies here too. First run surfaced a genuine, reproducible bug:

**A `GET /api/studies/:id` immediately after `POST /api/studies/:id/close` returned the pre-close (`"open"`) record.** Root-caused by process of elimination:

1. Suspected Next.js's default static caching of GET Route Handlers first — a GET handler that touches no dynamic Request API can be statically cached. Added `export const dynamic = "force-dynamic"` to both `route.ts` files (a correct defensive fix regardless, now kept). Staleness persisted even after a clean `.next` rebuild — ruled out as _the_ cause.
2. Suspected Supabase connection-pooler read-after-write lag next, since a standalone script hitting Supabase directly (bypassing Next.js) never reproduced it — but a few seconds' delay inconsistently masked the symptom in the app, which pointed at something time-sensitive rather than confirming the pooler theory outright.
3. Ran that same standalone script — constructing a **fresh Supabase client per call**, matching exactly what `getStudyRepository()` does per request — 5 times in a loop, still outside Next.js: zero failures. That eliminated the pooler as the cause entirely.
4. The only remaining variable was Next.js itself. Next.js patches the global `fetch` (used internally by `@supabase/supabase-js`) to add its own Data/Fetch Cache, and `dynamic = "force-dynamic"` on the _route segment_ wasn't reliably overriding the cache behavior of `fetch` calls made _inside_ a third-party SDK. Passing an explicit `global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) } }` to `createClient()` in `src/lib/supabase/client.ts` fixed it deterministically — verified with zero delay between close and get, and confirmed the fix doesn't regress the Supabase integration test suite (still 100% passing against the real test project).

This is the same shape of lesson M1–M3 already taught, sharpened further: even "isolate with a standalone script" can point at the wrong layer if the isolation doesn't match the real code path closely enough (step 2's few-second delay looked like pooler lag until step 3 controlled for the fresh-client-per-call detail and disproved it).

### Open follow-ups (not blocking, need you)

- None outstanding for M4. The fetch-caching fix in `src/lib/supabase/client.ts` applies to every repository (`Study`, `Interview`, `Summary`, `StudyReport`), not just `Study` — future milestones don't need to rediscover this.

---

## M5 — Participant Intake ✅ (2026-08-19)

### Tickets completed

- **T5.1** — `validateIntake(input)` (`src/participant-intake/intake-validation.ts`): pure function checking presence of first name and role blurb, plus email format (regex), reporting every invalid field at once.
- **T5.2** — `startInterview(deps, input)` (`src/participant-intake/start-interview.ts`): looks up the study by link token, applies M4's `checkLinkValidity`, applies T5.1's validation, requires explicit `consentGiven`, then creates the `Interview` and immediately records `consentGivenAt` via a follow-up `update` (kept `InterviewRepository.create`'s contract untouched rather than adding a consent field to it). Distinct error types (`StudyLinkNotFoundError`, `StudyLinkInvalidError` — carrying the `"closed" | "expired"` reason, `InvalidIntakeError`, `ConsentRequiredError`) so the API layer can map each to the right HTTP status.
- **T5.3** — `POST /api/studies/:linkToken/interviews` (`src/app/api/studies/[id]/interviews/route.ts`). `getInterviewRepository()` (`src/repositories/get-interview-repository.ts`) added alongside M4's `getStudyRepository()`.

**Deviation from the ticket's literal URL shape, forced by Next.js routing:** the ticket specifies `POST /api/studies/:linkToken/interviews`, but Next.js requires every route at the same URL position to share one dynamic-segment name — M4 already established `[id]` at `/api/studies/[id]` (study id, not link token) for the GET/close routes. Renaming would mean either breaking M4's routes or introducing a mismatched param name Next.js rejects at build time. Resolved by keeping the folder name `[id]` and documenting in the route file that this handler's `params.id` is actually the link token — the URL shape participants see (`/api/studies/<token>/interviews`) is unchanged; only the internal folder/param name diverges from the ticket's literal wording.

### Tests run

| Command                              | Result                                                                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 94 tests passed (12 new: 6 intake-validation + 6 start-interview) — 26 integration tests skipped, no credentials set                      |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                              |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                            |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                            |
| `npm run build`                      | ✅ Compiles; `/api/studies/[id]/interviews` registers as dynamic (`ƒ`) alongside the existing `[id]` routes with no Next.js routing conflict |

### Manual verification against a real Supabase test project

Ran the dev server and exercised `POST /api/studies/:linkToken/interviews` with `curl`: valid intake (201, `consentGivenAt` set, status `pending`), missing consent (400), malformed email (400, correct field message), unknown link token (404), and intake against a just-closed study's link (410 with `reason: "closed"`). All behaved as expected on the first try — no bugs found this milestone.

### Open follow-ups (not blocking, need you)

- None outstanding for M5.

---

## M6 — Voice Session Orchestration ✅ (2026-08-19, T6.6 closed out 2026-08-23)

Unlike M0–M5, this milestone integrates a real third-party service (Vapi) whose exact wire formats aren't derivable from our own codebase or REQUIREMENTS.md. Before writing code, researched Vapi's actual documented payload shapes (docs.vapi.ai) and a real Vapi example server repo (`VapiAI/server-side-example-javascript-bun`) rather than guessing — getting this wrong would only surface at T6.6's live call, too late to cheaply fix.

### Tickets completed

- **T6.1** — `POST /api/vapi/webhook` (`src/app/api/vapi/webhook/route.ts`), parsing the Server URL message shapes we act on (`src/voice-session/vapi-types.ts`): `status-update` and `end-of-call-report`, modeled from `docs.vapi.ai/server-url/events` and cross-checked against the example repo's actual handler code (which confirmed the request body really does include a `call` field alongside `model`/`messages`/`stream`).
- **T6.2** — `POST /api/vapi/chat/completions` (`src/app/api/vapi/chat/completions/route.ts`) as Vapi's custom-LLM target: `src/voice-session/custom-llm.ts`'s `generateTurn` resolves the Interview + Study behind `call.metadata.interviewId`, maps Vapi's OpenAI-formatted `messages` into `InterviewTurn[]`, and calls `InterviewAgent` (M3) — which owns the system prompt, so the incoming `system` message from Vapi is intentionally discarded rather than used. `src/voice-session/openai-response.ts` shapes the reply as an OpenAI-compatible SSE stream, the format Vapi's custom-LLM integration expects.
- **T6.3** — Status state machine in `src/voice-session/webhook-handler.ts`: `pending → in-progress` on the first `status-update` with `status: "in-progress"` (idempotent — a repeat event doesn't clobber the original `startedAt`), `in-progress → completed` on `end-of-call-report` (the only event carrying the final transcript/recording, so it's the sole source of truth for "completed" — a `status-update` with `status: "ended"` alone is intentionally a no-op).
- **T6.4** — The hard 20-minute cap is enforced by composition, not new code: `InterviewAgent.generateNextTurn` (M3) already applies `checkTermination`'s `HARD_CAP_MS` check on every turn, so once `generateTurn` is in the loop, no turn past the cap can continue the interview. Verified with a dedicated test using a fixed `startedAt`/`now` 20+ minutes apart. See "Two-layer defense" below for the gap this alone doesn't cover.
- **T6.5** — 22 new unit tests (`src/voice-session/__tests__/`) against fake Vapi payloads and `FakeLLMProvider` — no network calls.
- **T6.6** — Partially done. See "Manual verification" below for what was and wasn't possible without a live Vapi account.

### Design decisions made while researching Vapi's real integration surface

1. **Ending the call: `endCallPhrases`, not a tool-call.** Vapi supports two ways for an assistant to hang up on its own: the model can invoke a built-in `endCall` function (enabled via `endCallFunctionEnabled: true`, called as an OpenAI-style tool call), or Vapi can watch the assistant's spoken text for a configured exact phrase (`endCallPhrases`) and hang up when it's said. Went with `endCallPhrases`: our custom-LLM response isn't a real token stream (see #2), and correctly emitting OpenAI tool-call delta chunks by hand, matched against under-documented real behavior, was the riskier path to get right blind. Instead, `custom-llm.ts` appends a fixed constant (`END_CALL_PHRASE = "This concludes our interview session."`) to the utterance whenever `InterviewAgent` signals the interview is over — deterministic exact-phrase matching, rather than hoping the LLM phrases a consistent sign-off every time. **Requires the live Vapi assistant to be configured with `endCallPhrases: ["This concludes our interview session."]`** — not something our code can set (no assistant-management ticket exists yet in the plan; assistant config is presumably managed via the Vapi dashboard or a future ticket, referenced by ID from M11's client-side `vapi.start(assistantId)`).
2. **Custom-LLM responses are single-chunk SSE, not real token streaming.** Vapi's docs recommend streaming for lower TTS latency, but `InterviewAgent` calls Claude via structured JSON output (`utterance` + `shouldEndInterview` fields, with the M3 retry-on-degenerate-output guard) — which isn't naturally streamable token-by-token without losing that reliability. `openai-response.ts` sends the whole utterance as one SSE content chunk immediately followed by the finish chunk: valid per the documented format, but trades away incremental TTS start latency. Worth watching in the T6.6 live call for whether the resulting dead air is acceptable.
3. **The 20-minute cap has two layers, not one.** `InterviewAgent`'s per-turn check (T6.4) only fires when Vapi actually calls our custom-LLM endpoint again — if the participant goes silent right at/after the cap, no new turn request means our code never gets a chance to end the call. The real safety net for that case is Vapi's own `maxDurationSeconds` assistant-level cap, which hangs up regardless of turn activity. **Requires the live Vapi assistant to be configured with `maxDurationSeconds: 1200`** — same "not our code's responsibility to set" caveat as #1.
4. **`InterviewStatus`'s `"expired"` value is out of scope for M6.** The ticket text — "and expired for unused links, from T4.2" — read as a cross-reference to M4's already-built `checkLinkValidity`, not a new per-Interview transition to build here: `startInterview` (M5) already refuses to create an Interview under an invalid link, so any Interview that exists was created under a valid one. A `pending` Interview that's created but never actually connects to Vapi (participant abandons the tab before the call starts) has no defined transition to `"expired"` anywhere in the plan — that would need a scheduled sweep, which isn't specced. Left as `pending` indefinitely; flagged as an open question below rather than silently built or silently skipped.
5. **`call.metadata.interviewId` is the join key between our Interview records and every Vapi request** — set by us at call-creation time via `assistantOverrides.metadata`. Nothing in M6 sets it yet, because call creation itself is M11's job (Vapi's client-side Web SDK starts the call from the participant's browser, not a backend "create call" endpoint) — this is a hard dependency M11 must satisfy for M6's webhook/custom-LLM routes to ever receive a resolvable interview id.

### Tests run

| Command                              | Result                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 110 tests passed (22 new: 8 webhook-handler + 7 custom-llm + 1 openai-response, + termination/hard-cap reuse) — 26 integration tests skipped, no credentials set |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                                                     |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                                                   |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                                                   |
| `npm run build`                      | ✅ Compiles; `/api/vapi/webhook` and `/api/vapi/chat/completions` register as dynamic (`ƒ`)                                                                         |

### Manual verification against real Supabase + real Claude (not a real Vapi call)

Ran the dev server and drove the full pipeline with `curl`, using hand-built payloads shaped exactly like the researched real Vapi formats: created a study and interview (M4/M5), sent a `status-update` webhook (`in-progress` — confirmed `started_at` set, status transitioned), called `/api/vapi/chat/completions` with a real conversation history (real Claude API call, not `FakeLLMProvider`) — got back a correctly personalized, correctly SSE-formatted response referencing the participant by name and role — then sent an `end-of-call-report` webhook and confirmed the interview transitioned to `completed` with the transcript and recording URL persisted correctly. Also checked the error paths: a webhook missing `metadata.interviewId` still returns `200` (logged, not surfaced to Vapi), and a chat-completions request for an unknown interview returns `500`.

**This is not T6.6.** It proves our code does the right thing when fed Vapi-shaped payloads, but a real Vapi call is the only way to confirm the _actual_ wire format matches what was researched (docs were occasionally inconsistent between pages during research — see the "some example integrations put fields at the top level instead" fallback in `vapi-types.ts`), that `endCallPhrases`/`maxDurationSeconds` behave as documented, and that turn-taking/interruption latency with single-chunk SSE is acceptable.

### Open follow-ups (not blocking further coded milestones, but need you)

- **T6.6 proper — a real Vapi call end-to-end.** Needs: a Vapi account + API key, an assistant created with `endCallFunctionEnabled` not required (we use `endCallPhrases` — see decision #1) but `endCallPhrases: ["This concludes our interview session."]` and `maxDurationSeconds: 1200` configured, the custom-LLM URL pointed at `/api/vapi/chat/completions` (via ngrok for local dev), and the server URL pointed at `/api/vapi/webhook`. None of this exists yet — M11 is where the assistant actually gets started from a browser, so full T6.6 verification is realistically only doable once M11 exists too, even though the ticket lists it under M6.

### Correction (2026-08-21): the `metadata.interviewId` join key was in the wrong place — real bug, now fixed

While setting up to test M6 live, installed `@vapi-ai/web` (`npm install @vapi-ai/web`) and added a throwaway manual-test page (`src/app/dev/vapi-test/page.tsx`, not part of the product — a stand-in for M11's real UI, since `@vapi-ai/web` needs a real browser and can't run as a Node script). Inspecting the **installed package's own generated type definitions** (`node_modules/@vapi-ai/web/dist/api.d.ts` — Vapi's actual OpenAPI-generated types, materially more reliable than the docs-page summaries M6 was originally built against) surfaced two concrete errors in decision #5 above:

1. Vapi's `Call` object has **no `metadata` field of its own** — only `assistantOverrides?: AssistantOverrides`, and `AssistantOverrides.metadata` is where it actually lives. So webhook payloads carry it at `call.assistantOverrides.metadata`, not `call.metadata`.
2. The custom-LLM chat-completions request doesn't nest it under `call` at all in the default configuration — `CustomLLMModel.metadataSendMode` defaults to `"variable"`, whose own doc comment states the payload is shaped `{ messages, metadata }`: a **top-level** `metadata` field.

M6's original code read `call.metadata.interviewId` in both places — wrong in both places. Fixed in `vapi-types.ts`, `webhook-handler.ts`, and `custom-llm.ts`: webhook events now read `call.assistantOverrides.metadata.interviewId`; custom-LLM requests read a top-level `metadata.interviewId` first (falling back to `call.assistantOverrides.metadata.interviewId` defensively, in case `metadataSendMode` is ever configured differently). Updated the 8 webhook-handler tests and added 2 new custom-llm tests (one for the corrected primary path, one for the fallback) — 111 tests passing.

**Reproduced the bug live to confirm it was real, not theoretical:** replayed the M6 manual-verification flow against the corrected code using both real shapes (top-level `metadata` for chat-completions, `call.assistantOverrides.metadata` for the webhook) — both now succeed. Then replayed the _old_ shape (`call.metadata` directly, no top-level `metadata`) against the running server — it now correctly 500s with `MissingInterviewIdError`, confirming that a real Vapi call against the pre-fix code would have failed on every single turn.

**Takeaway for future milestones:** when a docs-summarization tool (WebFetch) and an installed package's actual `.d.ts` disagree, trust the `.d.ts` — it's generated straight from the vendor's spec, where the summarized docs prose had already proven inconsistent between pages during M6's initial research. Worth grepping `node_modules/<package>/dist/*.d.ts` directly earlier next time a third-party integration's exact wire shape matters, rather than only after getting stuck on something else.

- **The transcript-timestamp field names (`secondsFromStart`/`time`) and the `artifact.messages` vs. top-level `messages` shape are unverified against a real payload** — code handles both defensively (see decision points above), but which one Vapi actually sends wasn't confirmable from docs alone.
- **Per-Interview `"expired"` status has no defined trigger** (see decision #4) — worth a product decision on whether a stale `pending` Interview should ever transition, and if so, on what schedule.

### T6.6 status update (2026-08-22): partially run, not fully verified

You ran a real call against `/dev/vapi-test` and reported STT (transcription) working. Full T6.6 (confirming turn-taking quality, `endCallPhrases` hangup, `maxDurationSeconds`, and the persisted transcript/recording/summary) wasn't completed — recording it here rather than marking the milestone done, since "partially tested live" and "verified" are different claims. Still open per the follow-up above; M7 (below) proceeds on the strength of the metadata-path fix plus its own independent manual verification, not on T6.6 being finished.

### T6.6 closed out (2026-08-23)

A real end-to-end call through the M11 flow (`/interview/:linkToken`, not the throwaway `/dev/vapi-test` page) finally exercised the full path: `endCallPhrases` correctly ended the call when the Interview Agent decided to wrap up (`"This concludes our interview session."` appeared verbatim as the last transcript line), the interview transitioned to `completed`, and a rich, coherent ~30-turn transcript plus an accurate AI summary were both persisted. `maxDurationSeconds` wasn't separately exercised (the call ended naturally well under 20 minutes) — low-risk, since `checkTermination`'s hard-cap logic (T6.4) already has dedicated unit test coverage independent of a live call.

Getting to that successful call surfaced two real, unrelated bugs along the way — both diagnosed from HAR files and Vapi's own call-record API, not guessed at, and both are Vapi-account-configuration issues rather than app-code bugs:

1. **Stale ngrok domain in the assistant's config** (`.ngrok-free.app` vs. the actually-running `.ngrok-free.dev`) — Vapi's custom-LLM request never reached the app at all. Confirmed via `endedReason: "call.in-progress.error-providerfault-custom-llm-llm-failed"` and a direct `curl` to the stale domain returning `404`.
2. **Vapi's OpenAI text-to-speech integration failing** (`endedReason: "call.in-progress.error-vapifault-openai-voice-failed"`) — our custom-LLM endpoint was confirmed working correctly (a real, well-formed utterance was captured straight from ngrok's request log), but Vapi couldn't synthesize it to audio. Switched the assistant's voice provider from `openai` to Vapi's own built-in `vapi` provider (no external credentials required) and that resolved it.

See M11's entry below for the recording-playback bug (a third, separate issue) found once the call itself started succeeding.

---

## M7 — Transcript Capture & Individual Summary Generation ✅ (2026-08-22)

### Tickets completed

- **T7.1** — Already done as a byproduct of M6: `webhook-handler.ts`'s `handleEndOfCallReport` (built for T6.3) already stores the speaker-labeled transcript and Vapi recording URL against the `Interview` record on `end-of-call-report`. No new code needed here — just confirmed and cross-referenced.
- **T7.2** — `generateIndividualSummary(deps, interviewId)` (`src/summary-service/generate-individual-summary.ts`): loads the interview, rejects a missing/empty transcript (`MissingTranscriptError`) or unknown interview (`InterviewNotFoundError`), strips `TranscriptEntry`'s `timestampMs` down to the `{speaker, text}` shape `LLMProviderAdapter.generateSummary` expects, and persists the result via `SummaryRepository`. `src/repositories/get-summary-repository.ts` added alongside the existing `getStudyRepository`/`getInterviewRepository` factories.
- **T7.3** — Wired directly into `handleEndOfCallReport`: after the transcript is persisted, it calls `generateIndividualSummary`. A failure there is caught and logged, not rethrown — the interview is already correctly marked `completed` by that point, and a failed/missing summary is a separate, non-fatal problem (no "regenerate" ticket exists yet, and failing the whole webhook would incorrectly suggest the call itself didn't complete).
- **T7.4** — 5 new tests for `generateIndividualSummary` in isolation (`src/summary-service/__tests__/`), plus 2 new `webhook-handler` tests covering the trigger (summary actually gets created off the just-persisted transcript, and interview completion survives a summary-generation failure) — 118 tests total, all with `FakeLLMProvider`/fakes, no network calls.

**Design choice beyond the plan:** T7.3's trigger point is a genuine module-boundary judgment call worth recording. The module map lists Summary Service as depending only on the LLM adapter and repositories — not on Voice Session Orchestrator — but the ticket ("trigger T7.2 automatically when an interview transitions to completed") points at exactly the place that transition happens, inside `webhook-handler.ts`. Rather than duplicating the Vapi metadata-extraction logic at the API-route layer just to keep module dependencies one-directional, `webhook-handler.ts` calls `generateIndividualSummary` directly — Voice Session Orchestrator already owns "drives interview status transitions" per the module map, and triggering the next pipeline step on a transition is a natural extension of that same responsibility, not scope creep.

### Tests run

| Command                              | Result                                                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 118 tests passed (7 new: 5 generate-individual-summary + 2 webhook-handler trigger tests) — 26 integration tests skipped |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                             |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                           |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                           |
| `npm run build`                      | ✅ Compiles; no new routes (summary generation runs inside the existing webhook route)                                      |

### Manual verification against real Supabase + real Claude

Sent a realistic `end-of-call-report` webhook (a genuine multi-turn transcript about a manual, error-prone status-reporting workflow) to the running dev server. Confirmed: the interview transitioned to `completed` with the full transcript and recording URL persisted correctly, and — automatically, with no separate trigger call — a `Summary` row appeared with real Claude-generated `painPoints`/`notableQuotes`/`takeaways` that accurately reflected the transcript's actual content (correctly identified the ~3-hour weekly manual export/copy-paste workflow and the brittleness exposed when an upstream tool's export format changed). No bugs found this milestone.

### Open follow-ups (not blocking, need you)

- None outstanding for M7. (T6.6's full live-Vapi-call verification is still open — see M6's entry — but M7's own logic and live-infra behavior are independently verified above.)

---

## M8 — Study Report Generation ✅ (2026-08-22)

### Tickets completed

- **T8.1** — `generateStudyReport(deps, studyId)` (`src/study-report-service/generate-study-report.ts`): loads the study (`StudyNotFoundError` if missing), lists its interviews, filters to `completed` ones with a non-empty transcript, then fetches each one's individual summary — an interview lacking a summary is silently excluded rather than failing the whole call (see Design choice below) — builds `StudyReportInterviewInput[]`, calls `LLMProviderAdapter.generateStudyReport`, and persists via `StudyReportRepository.create` (which computes the next version). Throws `NoEligibleInterviewsError` if zero interviews qualify.
- **T8.2** — `POST /api/studies/:id/report` (`src/app/api/studies/[id]/report/route.ts`), mapping `StudyNotFoundError` → 404 and `NoEligibleInterviewsError` → 422. `getStudyReportRepository()` (`src/repositories/get-study-report-repository.ts`) added alongside the existing `get-*-repository` factories — the Supabase-backed implementation already existed from M1, just unused by any route until now.
- **T8.3** — 7 new tests (`src/study-report-service/__tests__/`) with `FakeLLMProvider` and in-memory repositories: single-interview study, multi-interview study, excluding a completed-but-unsummarized interview, version incrementing across repeated calls, and the two error cases.

**Design choice beyond the plan — a completed interview with no summary is excluded, not fatal.** M7 made summary generation on `end-of-call-report` best-effort and non-fatal (a failure there doesn't fail the webhook or block the interview from being marked `completed`). T8.1 has to account for that same possibility: an interview can legitimately be `completed` with a transcript but no `Summary` row. Rather than treating that as an error that blocks the whole report, `generateStudyReport` just skips such interviews — a partial report built from what did succeed is more useful than refusing to generate anything. Only when _no_ interview qualifies at all does it throw (`NoEligibleInterviewsError`), since an empty report would be silently misleading.

### Tests run

| Command                              | Result                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test` (Vitest, no external env) | ✅ 125 tests passed (7 new: generate-study-report — single/multi interview, exclude-unsummarized, version increment, 2 error cases) — 26 integration tests skipped |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                                                    |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                                                  |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                                                  |
| `npm run build`                      | ✅ Compiles; `/api/studies/[id]/report` registers as dynamic (`ƒ`) alongside the existing study routes                                                             |

### Manual verification against real Supabase + real Claude

Ran the dev server: created a study, created two interviews via the intake endpoint, sent an `end-of-call-report` webhook for each with a distinct realistic transcript (manual status-reporting pain for one, cross-team spreadsheet coordination for the other) — both transitioned to `completed` with a real Claude-generated individual summary persisted automatically (M7's trigger). Then `POST /api/studies/:id/report` made a real `generateStudyReport` call to Claude and returned three coherent cross-participant themes, each correctly citing verbatim quotes from both transcripts and `participantCount: 2`. Confirmed calling it again against the same study incremented `version` (1 → 2) rather than overwriting — this surfaced by accident (a stray shell fallback fired the request twice) but usefully doubled as a live verification of the versioning behavior. Also verified both error paths live: an unknown study id returns 404, and a freshly created study with no completed interviews returns 422 with `NoEligibleInterviewsError`'s message. No bugs found this milestone.

**Scripted this into a repeatable end-to-end smoke test:** `scripts/try-study-report.ts` (`npm run try:study-report`), following the same pattern as M4's `try:study-api` — create study → intake two participants → complete each via a simulated `end-of-call-report` → generate the report (real Claude call) → generate again to check version incrementing → both error paths, with pass/fail checks printed for each step. Run against the dev server: **14/14 checks passed.**

One check needed a rewrite after the first live run: it originally asserted some theme would have `participantCount === 2` (both participants clustered into one theme), which failed — Claude legitimately produced two single-participant themes that run instead of one shared one. Clustering is a real, non-deterministic LLM judgment call, not something the report generator controls or should be asserted on. Replaced with a check that both participants' actual transcript content is represented somewhere across the report's `representativeQuotes` — this is what actually matters (nothing got silently dropped), without over-constraining how the LLM organizes it.

**Adding this second script surfaced an unrelated, pre-existing sharp edge in the repo, now fixed:** `scripts/try-study-api.ts` and `scripts/try-study-report.ts` both use plain top-level `const`/`function` declarations with no imports or exports, which makes TypeScript treat each as a script sharing the _global_ scope rather than a module — fine with one such file, but a second one collides on every top-level name (`BASE_URL`, `check`, etc.) and fails `npx tsc --noEmit` project-wide. Fixed by adding `export {};` to both files, forcing module scope. Worth remembering for any future `scripts/try-*.ts` file: give it at least one `import` or an explicit `export {};`, or it'll silently share globals with every other import-less script.

### Open follow-ups (not blocking, need you)

- None outstanding for M8.

---

## M9 — PM Authentication ✅ (2026-08-22)

### Tickets completed

- **T9.1** — Supabase Auth (email/password) wired for PM login. Added `@supabase/ssr` (Supabase's recommended package for Next.js App Router cookie-based sessions — distinct from the existing service-role `createServerSupabaseClient` in `src/lib/supabase/client.ts`, which acts as an unrestricted backend, not a logged-in user) and three client helpers: `src/lib/supabase/browser-client.ts` (Client Components), `src/lib/supabase/server-client.ts` (Server Components/Route Handlers, via `next/headers` cookies), `src/lib/supabase/middleware-client.ts` (middleware, reads the request's cookies and writes any refreshed session onto the response). Pages: `/login` (`src/app/login/`), `/forgot-password`, `/reset-password`, and `/auth/callback` (Route Handler exchanging Supabase's redirect `code` for a real session — needed by the password-reset link).
- **T9.2** — Route protection middleware (`src/middleware.ts`), matched against `/dashboard/:path*` and `/api/studies/:path*`. Which paths actually require a session is a pure function, `requiresAuth` (`src/pm-auth/route-protection.ts`) — unit-tested independent of any Next.js/cookie plumbing. An unauthenticated `/dashboard/*` request redirects to `/login?redirectTo=<path>`; an unauthenticated `/api/*` request returns 401 JSON.
- **T9.3** — Password reset: `/forgot-password` calls `resetPasswordForEmail` (redirecting to `/auth/callback?next=/reset-password`); `/reset-password` calls `updateUser({ password })` once the callback route has exchanged the email link's code for a real (recovery) session.
- Added a minimal placeholder `/dashboard` page (Server Component reading the session + a "Log out" button) — M10 doesn't exist yet, but T9.2's acceptance criterion ("protected-route redirect") needs a real page behind the gate to redirect to/from and log into. M10 replaces this with the actual study list/creation UI; this page's only job is proving a session exists.

**Design choice — `requiresAuth` is a pure function, not inline middleware logic.** Per the module map's test strategy for PM Auth ("unit tests for any wrapper logic"), the one piece of real _logic_ here — deciding which paths need a session, including the one carve-out (`/api/studies/:linkToken/interviews`, the participant intake endpoint, must stay public even though it's nested under the otherwise-PM-only `/api/studies`) — is separated from the cookie/session mechanics so it can be tested directly, the same reasoning M4's `checkLinkValidity` and M5's validation functions already followed.

### Tests run

| Command                              | Result                                                                                                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 130 tests passed (5 new: `requiresAuth` — dashboard, PM study routes, intake carve-out, Vapi routes, public pages) — 26 integration tests skipped              |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                                                   |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                                                 |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                                                 |
| `npm run build`                      | ✅ Compiles; middleware registers (85.6 kB); `/login`, `/forgot-password`, `/reset-password` prerender static, `/dashboard` and `/auth/callback` register dynamic |

**Build-time bug found and fixed:** `next build` initially failed to prerender `/login` — `useSearchParams()` (used to read `?redirectTo=`) requires a `Suspense` boundary around it or Next.js bails out of static rendering entirely and errors. Fixed by splitting the form into a Client Component (`login-form.tsx`) wrapped in `<Suspense>` from the page itself, the standard Next.js App Router pattern for this.

### Manual/scripted verification against a real Supabase project

Added `scripts/try-pm-auth.ts` (`npm run try:pm-auth`, needs `--env-file=.env.local` since this script — unlike M4/M8's `try:*` scripts — talks to Supabase directly, not just the local dev server) covering what a script _can_ fully verify without a real browser: creates (or resets the password of, idempotently) a test PM account via the admin API, then confirms an unauthenticated `GET /dashboard` redirects to `/login`, an unauthenticated `GET /api/studies` returns 401, the participant intake endpoint stays reachable (not gated), and — hitting the exact REST endpoint `signInWithPassword` calls under the hood — the test account's real password is accepted and a wrong one is rejected. Run against the dev server: **7/7 checks passed.**

**What this does not verify, and why:** actually driving the `/login` React form, staying logged in across page loads via the real cookies `@supabase/ssr` sets from browser JS, clicking "Log out", and clicking a real password-reset email link all require an actual browser and a real inbox — the same category of gap M6 hit with live Vapi calls. The script prints the test account's credentials and a 3-step click-through checklist at the end of its run for exactly this reason.

### Real bugs found and fixed after live browser testing

Two issues surfaced only once an actual browser hit the running dev server — neither was catchable by the unit tests or the scripted `try:pm-auth` checks, the same pattern M1/M4/M6 already established (fake/mocked/curl-level testing proves logic correctness, not real-world behavior).

1. **Stale dev-server processes, not a code bug.** After several `npm run dev` restarts across this session (mine and the user's), three orphaned `node.exe` processes were left listening on ports 3000–3002, causing `npm run dev` to appear to hang ("never quite comes up") since it had to probe past all of them. Killed via `Stop-Process`; not a defect in the app itself, but worth remembering when a dev server misbehaves after repeated restarts on Windows — check `netstat -ano` for stale listeners before assuming the code broke.
2. **Real bug: `NEXT_PUBLIC_*` env vars weren't reaching the browser.** Logging in threw `Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL` even though `.env.local` had it set correctly and a fresh `next dev` process's own env-loading (verified directly via `@next/env`'s `loadEnvConfig`) picked it up fine. Root cause: `browser-client.ts`'s `requirePublicEnv(name)` helper read the var via **dynamic** bracket access, `process.env[name]` where `name` is a function parameter. Next.js's webpack build only inlines `NEXT_PUBLIC_*` values when it sees a **literal**, statically-analyzable expression like `process.env.NEXT_PUBLIC_SUPABASE_URL` directly in the source — it's a textual substitution at compile time, not a real runtime lookup. A dynamic access isn't recognized, so nothing gets inlined, and the browser (which has no real `process.env`, only whatever got inlined) silently reads `undefined`. Confirmed by diffing the compiled `.next/static/chunks/app/login/page.js` — the variable _name_ string was present (from the error message text) but the actual URL value was nowhere in the bundle. Fixed by reading both vars via literal `process.env.NEXT_PUBLIC_SUPABASE_URL` / `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` expressions directly in `browser-client.ts`, with a comment warning against copying the dynamic-lookup pattern from `server-client.ts`/`middleware-client.ts` (where it's actually safe, since those run server-side with a real `process.env`) into any Client Component. Verified live: the rebuilt bundle now contains the real URL, and you confirmed login → dashboard → (implicitly) logout works end to end.

### Open follow-ups (not blocking, need you)

- None outstanding for M9 — full browser click-through (login, session persistence, protected-route redirect) confirmed working by you on 2026-08-22. Password-reset email delivery (forgot-password → inbox → reset link → new password) was not separately re-confirmed after the env-var fix, but that flow's code didn't change — low risk, worth a quick check next time you touch auth.

---

## M10 — PM Dashboard UI ✅ (2026-08-22)

### Tickets completed

- **T10.1** — "New Study" form (`src/app/dashboard/studies/new/`). `new-study-form.tsx` (Client Component) pre-validates client-side using the exact same pure `validateTargetProfile` function the API route uses server-side (imported directly from `@/study-service/target-profile-validation`, not the `@/study-service` barrel — see bug note below), then `POST`s to M4's `/api/studies` and shows the generated link via a shared `StudyLink` component (computes the full URL from `window.location.origin` + the study's `linkToken`).
- **T10.2** — Study list (`src/app/dashboard/page.tsx`): fetches directly via `getStudyRepository().list()` (a Server Component running server-side is exactly as "server-only" as an API route, so no self-fetch through the app's own HTTP API is needed — same reasoning applies to T10.3/T10.4 below), sorted newest-first, each row linking to its detail page.
- **T10.3** — Study detail (`src/app/dashboard/studies/[studyId]/page.tsx`): target profile, status, the shareable link, and the list of interviews (name/status/date) — each row links to T10.4's interview detail page.
- **T10.4** — Interview detail (`src/app/dashboard/studies/[studyId]/interviews/[interviewId]/page.tsx`): transcript, individual summary (pain points/notable quotes/takeaways), and an `<audio>` player against the stored Vapi `recordingUrl`. Guards against `interview.studyId !== params.studyId` (not just a missing id) — a stale or tampered URL pointing at an interview from a different study 404s instead of leaking cross-study data.
- **T10.5** — Study report section on the study detail page: latest report's themes/quotes/participant counts if one exists, plus a `GenerateReportButton` (Client Component) that `POST`s to M8's `/api/studies/:id/report` and calls `router.refresh()` on success so the Server Component re-fetches and shows the new version — no client-side report state duplicated.
- Added `src/app/dashboard/layout.tsx` (shared header: app name, logged-in email, logout) so every dashboard page doesn't re-implement chrome, and `src/app/dashboard/study-link.tsx` (shared copy-to-clipboard link display, used by both the new-study success screen and the study detail page).

**Decision made here, not in the plan: the participant-facing URL shape.** M11 (Participant-Facing UI) doesn't exist yet, so nothing had previously fixed what URL a study's link actually points at. `StudyLink` establishes `/interview/:linkToken` as that convention — M11 must serve its intro/consent screen at this path for the links PMs generate today to keep working once M11 ships.

### Tests run

| Command                              | Result                                                                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 133 tests passed (3 new: `NewStudyForm` component tests — empty-field validation blocks the API call, successful submission shows the link, server-side field errors are surfaced) — 26 integration tests skipped |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                                                                                                      |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                                                                                                    |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                                                                                                    |
| `npm run build`                      | ✅ Compiles; all `/dashboard/*` routes register dynamic (`ƒ`), consistent with reading the session on every request                                                                                                  |

**New test infrastructure:** this is the first milestone with component tests, so `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, and `@testing-library/user-event` were added. Two real setup snags, both fixed without touching the global Vitest config (kept scoped to avoid risking the rest of the suite, which runs in `node` environment):

1. **jsdom 27 (latest) crashes under this project's pinned Vitest 2.1.9.** `jsdom`'s CSS engine (`@asamuzakjp/css-color` → `@csstools/css-calc`) ships ESM-only and Vitest 2's CJS-based Vite build can't `require()` it — `ERR_REQUIRE_ESM` before a single test runs. Pinned `jsdom` to `24.1.3` (predates that dependency), which works cleanly. Same root cause as M0's Vitest pin: this project is intentionally a version behind on a few tools because of the Node 20.18 constraint, and newer transitive dependencies keep periodically colliding with that pin — worth remembering as a recurring category of issue, not a one-off.
2. **`.tsx` test files failed with `React is not defined`.** `tsconfig.json` sets `"jsx": "preserve"` (correct for Next.js's own SWC compiler), but Vitest's esbuild transform doesn't read that the same way and left JSX untransformed. Fixed with `esbuild: { jsx: "automatic" }` in `vitest.config.ts`, applied project-wide since it only affects `.tsx` files (none existed before this milestone).
3. Also needed an explicit `afterEach(() => cleanup())` in the test file — `@testing-library/react`'s automatic cleanup relies on detecting Jest/Vitest globals on `globalThis`, which isn't the case here since `vitest.config.ts` doesn't set `test.globals: true` (tests explicitly import `describe`/`it`/etc. instead). Without it, the second test in a file saw the first test's still-mounted DOM and `getByLabelText` failed with "multiple elements found."

**Real bug found by `next build` (not by lint, typecheck, or tests):** `new-study-form.tsx` imported `validateTargetProfile` from the `@/study-service` barrel (`index.ts`), which also re-exports `link-token.ts` — a server-only module using `node:crypto`. Since `new-study-form.tsx` is a Client Component, webpack tried to bundle that for the browser and failed outright (`UnhandledSchemeError: Reading from "node:crypto" is not handled by plugins`), not silently. Fixed by importing directly from `@/study-service/target-profile-validation` instead of the barrel. Worth remembering for any future Client Component that needs one pure function out of a barrel that also contains server-only siblings — import the specific module, not the barrel.

### Manual verification

Data-layer queries were verified directly against real Supabase data (bypassing HTTP/auth, since faking a real `@supabase/ssr` session cookie for `curl` would mean reverse-engineering its internal chunked-cookie encoding — not worth it for what the milestone's own acceptance criteria already call for manual verification of): confirmed `getStudyRepository().list()`, `listByStudyId`, `getSummaryRepository().getByInterviewId`, and `getStudyReportRepository().getLatestByStudyId` all return correct, well-shaped data against the real project — including several studies left over from M4/M7/M8 testing that happen to exercise every UI branch (multiple completed interviews with summaries and a generated report, an interview with a recording but no summary yet, a `pending` interview, an `in-progress` interview, and empty-state studies with zero interviews).

Also re-ran `npm run try:pm-auth` as a regression check after all the M10 changes — still 7/7 passing, confirming M9's auth/middleware behavior wasn't disturbed by adding the new `/dashboard/*` routes.

**The actual visual click-through (does it look right, does every page render without a server error, does the "Generate study report" button work end to end in a browser) has not been done** — same category of gap as M9's browser-only checks. Full `next build` succeeding proves every page compiles and type-checks; it doesn't prove the JSX renders correctly or looks reasonable.

**Incident during verification, not a code bug:** while running a separate `npm run build` to verify the new routes compile, `next.config.mjs` was temporarily edited to point `distDir` at `.next-build-check` so the build wouldn't collide with the file lock your already-running `npm run dev` held on `.next` (a real Windows EPERM conflict on `.next/trace` the first time this was tried). The config was reverted afterward, but changing `next.config.mjs` while your dev server was watching it apparently caused the dev server process to exit — you had to restart `npm run dev`. Worth remembering: don't edit `next.config.mjs` while a dev server you don't control is running against the same directory.

### Browser click-through confirmed (2026-08-22)

You confirmed the dashboard's links work in a real browser session — study list → study detail → interview detail navigation, and the shareable study link, all behave as expected.

### Open follow-ups (not blocking, need you)

- None outstanding for M10. The `/interview/:linkToken` page itself still 404s when actually opened — expected, since M11 (Participant-Facing UI) is what builds that page; `StudyLink` only establishes the URL convention M11 must serve.

---

## M11 — Participant-Facing UI ✅ (2026-08-22, live call verified 2026-08-23)

### Tickets completed

- **T11.1** — Intro/consent screen (`intro-screen.tsx`): study purpose, recording disclosure, partner framing, and the "I agree, start interview" consent gate — per REQUIREMENTS.md's flow, this click is what makes `consentGiven: true` on the intake submission truthful, even though the API call itself happens one screen later.
- **T11.2** — Intake form (`intake-form.tsx`): name/email/role, client-side pre-validated with the same pure `validateIntake` function T5.1 already built (imported directly from `@/participant-intake/intake-validation`, not the barrel — see bug note below), `POST`s to M5's `/api/studies/:linkToken/interviews` with `consentGiven: true` always set (this screen is unreachable without passing T11.1's gate first).
- **T11.3** — Live interview (`live-call.tsx`): starts the Vapi web call (`@vapi-ai/web`, already installed for M6's throwaway test page) as soon as the screen mounts — `.start()` is what triggers the browser's mic-permission prompt, so no separate "grant mic access" step is needed beyond what Vapi's SDK already does. Status display (connecting/in-progress/ended/error) and an "End call" button; `call-end` advances to T11.4.
- **T11.4** — Completion screen (`completion-screen.tsx`): "Thank you, you're done" plus the partner-framing follow-up copy from REQUIREMENTS.md.
- **T11.5** — Expired/invalid-link screen (`link-invalid-screen.tsx`): distinct copy for "not-found" (bad token — not one of T4.2's `LinkValidity` states, since no study was even found), "closed", and "expired".
- `src/app/interview/[linkToken]/page.tsx` (Server Component) is the actual entry point — checks the study exists and `checkLinkValidity` (T4.2) server-side, direct repository access, before anything renders. An invalid link never gets far enough to show the intro screen only to fail on submit. `interview-flow.tsx` (Client Component) then drives T11.1→T11.4 as one continuous flow with no page reloads between steps, holding the created `Interview` in local state to pass its id into T11.3.

**Decision made here: `NEXT_PUBLIC_VAPI_ASSISTANT_ID` is now a real, required env var**, added to `.env.example`. M6's PROGRESS.md flagged that assistant configuration (`endCallPhrases`, `maxDurationSeconds`) has no dedicated ticket and would be "referenced by ID from M11's client-side `vapi.start(assistantId)`" — this is that reference point. Not set in `.env.local` yet; see Open follow-ups.

### Tests run

| Command                              | Result                                                                                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 137 tests passed (4 new: `IntakeForm` component tests — empty-field validation, malformed-email rejection, successful submission sends `consentGiven: true` and returns the interview, server-side errors surfaced) — 26 integration tests skipped |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                                                                                                                                       |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                                                                                                                                     |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                                                                                                                                     |
| `npm run build`                      | ✅ Compiles; `/interview/[linkToken]` registers dynamic (`ƒ`); all M9/M10 routes unaffected                                                                                                                                                           |

**Two real bugs found, both fixed:**

1. **Same barrel-import bug as M10, in a new place.** `intake-form.tsx` (Client Component) initially imported `validateIntake` from the `@/participant-intake` barrel, which also re-exports `start-interview.ts` → `@/study-service`'s barrel → `link-token.ts`'s `node:crypto`. Caught this one before it ever reached `next build`, from the M10 lesson already written down — imported from `@/participant-intake/intake-validation` directly instead.
2. **Native HTML5 email validation silently swallowed the malformed-email test.** `intake-form.tsx`'s email `<input type="email">` triggers the browser's own constraint validation, which blocks the `submit` event entirely before `handleSubmit` ever runs when the value doesn't look like an email — so neither our custom `validateIntake` error message nor a fetch call ever happened, and the component test timed out waiting for an alert that would never appear. Fixed with `noValidate` on the `<form>`, so our own consistent error messaging (same as every other form in this app) is the only validation path, not an inconsistent, unstyled browser-native tooltip.

**Test infrastructure snag:** `LinkInvalidScreen`'s reason type was initially `LinkValidity | "not-found"` (`"valid" | "closed" | "expired" | "not-found"`), but a `Record` keyed by that type requires a `"valid"` entry that can never actually occur — this component is only ever rendered for the three invalid cases. Fixed with `Exclude<LinkValidity, "valid"> | "not-found"` as the prop type, so the `Record` is exhaustive over exactly the reachable states.

### Manual/scripted verification against real Supabase data

Verified all three `LinkInvalidScreen` states plus the valid-link intro screen live against the running dev server, using real Supabase study data (fetched via a throwaway script, not hardcoded): an unknown token shows "Link not found," a real closed study's token shows "This study is no longer accepting interviews," and a real open study's token renders the intro screen. Also re-ran `npm run try:pm-auth` as a regression check — still 7/7 passing, confirming the new public `/interview/*` route didn't disturb M9's auth/middleware behavior.

**Build isolation, learned from M10's incident:** M10's entry documented that editing `next.config.mjs` while your dev server was running caused it to exit. This time, `npm run build` was run against a fully separate temporary copy of the project (via `robocopy` + a `node_modules` junction, not a real copy — avoids a slow reinstall) instead of touching the real project's `next.config.mjs` or `.next` at all. Your dev server was confirmed still running (same PID) before and after. Worth keeping as the standard approach for any future "verify the build compiles while the dev server is up" situation.

**T11.3 (live call) has not been verified with a real Vapi call.** Same category of gap as M6's still-open T6.6: needs `NEXT_PUBLIC_VAPI_ASSISTANT_ID` set to a real assistant (configured per M6's notes — `endCallPhrases: ["This concludes our interview session."]`, `maxDurationSeconds: 1200`, server URL and custom-LLM URL pointed at this app), which isn't set in `.env.local` yet. The component test coverage stops at "the intake form successfully creates an Interview and hands its id to the next screen" — everything past that (mic permission prompt, actual voice turn-taking, `call-end` firing correctly) is unverified.

### Real bug found from a real attempt, fixed (2026-08-22)

You set up a Vapi assistant (custom-LLM `model.url` pointed at the ngrok tunnel's base `/api/vapi`, correctly relying on Vapi's own OpenAI-client convention of appending `/chat/completions` — confirmed against `CustomLLMModel`'s own type doc comment, no code change needed there), set `NEXT_PUBLIC_VAPI_ASSISTANT_ID`, and did a real click-through. The call immediately showed "Call error." You captured a HAR file, which is what actually diagnosed it: two separate `POST https://api.vapi.ai/call/web` requests, both carrying the **same** `interviewId`, both returning `201` — two independent Vapi calls got created for one interview, fighting over the same microphone.

**Root cause: React 18 StrictMode (on by default in `next dev`) double-invokes every `useEffect` — mount → cleanup → mount again — specifically to surface unsafe, non-idempotent side effects like this one.** `live-call.tsx`'s effect had no guard, so `vapi.start()` fired twice. This is dev-mode-only; a production build doesn't double-invoke.

Fixed with the standard pattern for a side effect that must run exactly once regardless of StrictMode: a `useRef` guard checked before any of the `vapi.start()` setup, which persists across the phantom cleanup/re-invoke cycle (unlike a plain local variable). The `vapi.stop()` call was also removed from the effect's cleanup entirely — with the guard in place, that cleanup would otherwise still fire on the StrictMode phantom pass and end every dev-mode call moments after it started, before it could ever connect. The call is now only stopped via the explicit "End call" button or Vapi's own `call-end` event (`maxDurationSeconds`/`endCallPhrases`), both of which already call `onEnded()` — by the time `LiveCall` unmounts in the normal flow, the call is already over, so nothing relies on cleanup-triggered `.stop()` in practice.

Re-ran the full check suite after the fix — 137 tests still passing, lint/typecheck/format clean.

### Live call succeeded, and a fourth real bug found: recordings weren't playable (2026-08-23)

After the StrictMode fix, plus the two Vapi-account config fixes recorded in M6's entry above (stale ngrok domain, OpenAI voice provider failure), a real interview finally completed end to end: full transcript, clean `endCallPhrases` termination, and an accurate AI summary all persisted correctly. But the recording didn't play in the dashboard.

Root cause: Vapi's `end-of-call-report` `recordingUrl` points at HIPAA-compliant storage requiring AWS-signature auth — not something a browser `<audio>` tag can provide, and not something our own Vapi API key satisfies either (confirmed by directly `curl`-ing the URL: `400 Bad Request`, then trying our API key: still rejected, wanting `x-amz-content-sha256`-style S3 signing). Vapi does expose a genuinely public, working URL (`artifact.presignedStereoUrl` from `GET /call/{id}`) — confirmed by fetching it directly and getting a real `206 Partial Content` / `audio/wav` response — but it expires roughly 33 minutes after the call ends, so it can't just be captured once at webhook time and stored.

**Fix (a real architecture addition, not a one-line patch):**

- New DB column `interviews.vapi_call_id` (migration `0002_add_vapi_call_id.sql`, applied manually via the Supabase SQL Editor — no direct Postgres access available to run it automatically).
- `webhook-handler.ts` now captures `call.id` from the `end-of-call-report` payload alongside the transcript/recording.
- New `src/lib/vapi/client.ts` (`fetchFreshRecordingUrl`): server-only, calls `GET https://api.vapi.ai/call/{id}` using a new **private**, server-only `VAPI_API_KEY` env var (distinct from the existing public `NEXT_PUBLIC_VAPI_PUBLIC_KEY`), returns `artifact.presignedStereoUrl`/`presignedMonoUrl`. Fails soft (`null`, not a thrown error) on any problem — a missing recording shouldn't break the whole interview detail page.
- The interview detail page (M10) now resolves a fresh URL from `vapiCallId` on every view instead of using whatever was stored — correct indefinitely, not just for ~33 minutes after a call ends. Falls back to the old stored `recordingUrl` for interviews that predate this fix (`vapiCallId` will be `null` for those).
- 6 new tests for `fetchFreshRecordingUrl`, plus updated webhook-handler/contract tests for `vapiCallId` — **143 tests passing**, lint/typecheck/build all clean.

**Verified without needing another live call:** backfilled the one real completed interview's `vapiCallId` with its already-known Vapi call id, then called the real `fetchFreshRecordingUrl` function directly (not a mock) — it returned a freshly-signed URL, confirmed playable via a direct `curl` (`206 Partial Content`, `audio/wav`). You then confirmed it plays correctly in the actual dashboard UI.

### Open follow-ups (not blocking, need you)

- None outstanding for M6 or M11 — both fully verified with a real end-to-end call, real transcript, real summary, and real playable recording.
- Interviews completed before this recording-URL fix have `vapiCallId: null` and will show the old, non-playable `recordingUrl` (or "No recording available" once that link visibly fails). Only worth backfilling if any of those specific interviews' recordings actually matter to you — otherwise not worth chasing for MVP.

---

## M13 — Participant Experience Refinements ✅ (2026-08-23, live-verified 2026-08-24)

Feedback from M11's live-call testing (a real interview run through the participant flow) — five small usability/robustness fixes to the participant-facing experience, not new functionality. Planned via plan mode (see the approved plan for full context/design rationale) rather than jumped into directly, since it touched the domain model, the LLM system prompt, and required a real design decision (nullable field vs. removal) plus a genuine unknown (Vapi's silence-timeout behavior) surfaced mid-planning.

### Tickets completed

- **T13.1** — Dropped the role-description textarea from the participant intake form (`intake-form.tsx`). `Interview.roleDescription` is now `string | null` end-to-end: domain type, `CreateInterviewInput` (now optional), both repository implementations, `rows.ts`, `validateIntake`/`IntakeInput`, `startInterview`, and the intake API route. Migration `0003_role_description_nullable.sql` drops the `not null` constraint. Dashboard's study-detail interview list and interview-detail header now render null-safely (the role line/segment simply doesn't show when absent, instead of rendering `null`/erroring).
- **T13.2** — `system-prompt.ts` rewritten: the "Who you're talking to" section no longer claims to know the participant's role (nothing to state — it was never collected), and Structure step 1 now explicitly instructs opening the interview by asking about role and day-to-day responsibilities, before anything else. `InterviewPromptContext.participantRoleDescription` is `string | null` (kept on the interface rather than removed, per the plan, in case a future path ever supplies it — currently always `null` in practice).
- **T13.3** — Intro screen's duration estimate corrected: "10–20 minutes" → "15–20 minutes", matching what the M11 live-verification call actually took.
- **T13.4** — `live-call.tsx` now shows an elapsed-time counter (`M:SS`, ticking every second) once the call reaches `in-progress`. Starts from Vapi's `call-start` event, not by parsing live speech/transcript events — a deliberate simplification, since the assistant has no configured `firstMessage` and already waits for the participant to speak first, so `call-start` and "participant starts speaking" coincide in this app's actual configuration.
- **T13.5** — Not a code change: PATCHed the live Vapi assistant with `silenceTimeoutSeconds: 30`, making explicit what had been an undocumented default. Confirmed via the PATCH response (`"silenceTimeoutSeconds":30`) alongside the other assistant settings established during M6/M11 (`endCallPhrases`, `maxDurationSeconds: 1200`, `voice: {provider: "vapi", voiceId: "Elliot"}`).

**Real question raised during planning, investigated, and resolved before any code was written:** you asked what stops a participant who clicks "Start interview" but never speaks from running up cost indefinitely. Checked Vapi's own SDK type definitions (`Assistant.silenceTimeoutSeconds`, defaults to 30) — this was already handled by Vapi's default behavior, just never deliberately configured or documented on our side. T13.5 exists specifically because of that question; without it, this milestone would have shipped four UI/prompt changes with an unexamined cost-safety assumption baked in.

### Tests run

| Command                              | Result                                                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 144 tests passed (net +1: `intake-validation` lost 1 role-related case, `system-prompt` gained 2 — an opening-question assertion and a null-safety case) — 26 integration tests skipped                     |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                                                                                                |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                                                                                              |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                                                                                              |
| `npm run build`                      | ✅ Compiles; same isolated-temp-copy approach as M10/M11 (never touches the live dev server's `.next`/`next.config.mjs`) — `/interview/[linkToken]` still registers dynamic (`ƒ`), all other routes unaffected |

### Manual verification so far

Confirmed live against the running dev server (no DB migration needed for these): the intro screen renders "15–20 minutes" for a real open study's link, and the rendered intake form's HTML no longer contains the role textarea at all.

### Migration applied and full live click-through completed (2026-08-24)

Migration `0003_role_description_nullable.sql` applied via the Supabase SQL Editor — confirmed indirectly first (a real Supabase integration test run created an interview with no `roleDescription` and got `null` back with no constraint violation) and then directly (a targeted insert against `interviews` with `role_description: null` failed only on an intentionally-fake `study_id` foreign key, never on a not-null violation).

You then ran the full live click-through end to end: intro screen showed the updated duration, intake form had no role field, the interviewer opened by asking about role/responsibility, the elapsed-time counter ticked correctly during the call, and the dashboard rendered the completed interview correctly with no role blurb. All five tickets (T13.1–T13.5) confirmed working in practice, not just compiling and passing unit tests.

As a side effect of the live-call testing, pulled the real cost breakdown for a full ~~16.6-minute interview directly from Vapi's API (`GET /call/:id`) — useful operating-cost data point, not a bug: **$1.1451 total (~$0.069/min)**, split across the Vapi platform fee (~~$0.05/min), Deepgram STT (~$0.0098/min), Vapi's built-in TTS voice (~$0.0081/min), and transport (~$0.0012/min). The `llm` cost line is always `$0` in Vapi's own accounting because this app uses a custom LLM (our own `/api/vapi/chat/completions` calling Claude) — that cost is billed separately by Anthropic and isn't reflected in Vapi's numbers at all. A 20-minute call extrapolates to roughly $1.38 in Vapi charges alone, plus separate Anthropic API cost.

### Open follow-ups (not blocking, need you)

- None outstanding for M13.

---

## Template for future milestone entries

```
## M# — <Name> <status emoji> (<date>)

### Tickets completed
- **T#.#** — ...

### Tests run
| Command | Result |
|---|---|

### Deviations from plan / decisions made
1. ...

### Open follow-ups
- ...
```
