# Implementation Progress Log

Tracks milestone completion against [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — what's done, what tests were run and their results, and any deviations from the plan (with reasoning) so decisions aren't lost. Update this file at the end of each milestone.

## Status Overview

| Milestone                                    | Status         | Date       |
| -------------------------------------------- | -------------- | ---------- |
| M0 — Project Scaffolding                     | ✅ Complete    | 2026-08-18 |
| M1 — Domain Model & Data Layer               | ✅ Complete    | 2026-08-18 |
| M2 — LLM Provider Adapter                    | ✅ Complete    | 2026-08-18 |
| M3 — Interview Agent                         | ✅ Complete    | 2026-08-18 |
| M4 — Study & Link Management                 | ⬜ Not started |            |
| M5 — Participant Intake                      | ⬜ Not started |            |
| M6 — Voice Session Orchestration             | ⬜ Not started |            |
| M7 — Transcript Capture & Individual Summary | ⬜ Not started |            |
| M8 — Study Report Generation                 | ⬜ Not started |            |
| M9 — PM Authentication                       | ⬜ Not started |            |
| M10 — PM Dashboard UI                        | ⬜ Not started |            |
| M11 — Participant-Facing UI                  | ⬜ Not started |            |
| M12 — End-to-End MVP Acceptance              | ⬜ Not started |            |

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

| Command                              | Result                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest, no external env) | ✅ 65 tests passed (19 new: 6 system-prompt + 7 termination + 6 interview-agent) — 26 integration tests skipped, no credentials set |
| `npm run lint` (`next lint`)         | ✅ No ESLint warnings or errors                                                                                                     |
| `npx tsc --noEmit`                   | ✅ No type errors                                                                                                                   |
| `npm run format:check` (Prettier)    | ✅ All files match Prettier style                                                                                                   |

No live-service integration test needed for M3 — it has no I/O of its own (`InterviewAgent` only calls the already-verified `LLMProviderAdapter` interface), so the `FakeLLMProvider`-driven unit tests are the appropriate and complete verification here.

### Open follow-ups (not blocking, need you)

- None outstanding for M3.

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
