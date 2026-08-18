# Implementation Progress Log

Tracks milestone completion against [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — what's done, what tests were run and their results, and any deviations from the plan (with reasoning) so decisions aren't lost. Update this file at the end of each milestone.

## Status Overview

| Milestone                                    | Status         | Date       |
| -------------------------------------------- | -------------- | ---------- |
| M0 — Project Scaffolding                     | ✅ Complete    | 2026-08-18 |
| M1 — Domain Model & Data Layer               | ✅ Complete    | 2026-08-18 |
| M2 — LLM Provider Adapter                    | ⬜ Not started |            |
| M3 — Interview Agent                         | ⬜ Not started |            |
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

- Create the actual Supabase project(s) (dev + test) and populate `.env.local` from `.env.example`.
- Push the repo to a GitHub remote so the CI workflow actually runs (it's committed but currently inert).

---

## M1 — Domain Model & Data Layer ✅ (2026-08-18)

### Tickets completed

- **T1.1** — Domain types added under `src/domain/`: `Study`/`TargetProfile`/`StudyStatus`, `Interview`/`TranscriptEntry`/`InterviewStatus`, `Summary`, `StudyReport`/`StudyReportTheme`, `PMAccount` (identity only — no custom table, backed by Supabase Auth).
- **T1.2** — SQL migration `supabase/migrations/0001_init.sql`: `studies`, `interviews`, `summaries`, `study_reports` tables, with FK cascade deletes, status check constraints, and a `unique (study_id, version)` constraint on `study_reports`. Not yet applied to a real Supabase project — see Open Follow-Ups.
- **T1.3** — `StudyRepository` and `InterviewRepository` interfaces (`src/repositories/*.ts`) plus in-memory fake implementations (`src/repositories/in-memory/`).
- **T1.4** — `SupabaseStudyRepository` and `SupabaseInterviewRepository` (`src/repositories/supabase/`), mapping snake_case DB rows to domain types.
- **T1.5** — Same interface/fake/Supabase-impl pattern repeated for `SummaryRepository` and `StudyReportRepository` (the latter computes `version` server-side, incrementing per study).

**Design choice beyond the plan:** each repository's test suite is written once as a shared "contract test" (`src/repositories/contract-tests/*.contract.ts`) and run against _both_ the in-memory fake and the real Supabase-backed implementation, so the two are proven to satisfy identical behavior instead of hand-writing two divergent test suites per repository.

### Tests run

| Command                           | Result                                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (Vitest)               | ✅ 26 tests passed (in-memory contract suites for all 4 repositories + existing M0 tests) — 22 Supabase integration tests **skipped** (no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` set yet) |
| `npm run lint` (`next lint`)      | ✅ No ESLint warnings or errors                                                                                                                                                               |
| `npx tsc --noEmit`                | ✅ No type errors                                                                                                                                                                             |
| `npm run format:check` (Prettier) | ✅ All files match Prettier style                                                                                                                                                             |

### Deviations from plan / decisions made

1. **`tsconfig.json` needed an explicit `"target": "ES2020"`.** The scaffolded config had no `target`, which defaults to ES3 — iterating a `Map`'s `.values()` (used in the in-memory repositories) doesn't compile without at least ES2015. Also had to clear a stale `tsconfig.tsbuildinfo` once after the change (incremental build cache masked the fix on the first re-run).
2. **`vitest.config.ts` needed an explicit `@` path alias.** TypeScript resolves `@/*` via `tsconfig.json` `paths`, but Vitest (Vite) doesn't read that automatically — repository/domain imports failed at test-run time until `resolve.alias` was added pointing `@` at `./src`.
3. **Contract-test factories are `() => T | Promise<T>`, not just `() => T`.** The Supabase-backed integration tests need to async-clean relevant tables before each test hands back a repository instance (so, e.g., `list()` assertions aren't polluted by rows left over from a prior run or a prior test). Every `it()` in the shared contract tests now `await`s the factory.
4. **Foreign-key IDs (`studyId`, `interviewId`) are passed to contract tests as getters (`() => string`), not plain strings.** The Supabase suites create their fixture study/interview in `beforeAll`, which hasn't run yet at the point the contract-test function synchronously registers its `it()` blocks — a plain string parameter would capture `undefined`.
5. **Migration SQL is written but not applied anywhere yet** — no Supabase project exists (per M0's open follow-up), so this is unverified against a real Postgres instance. The Supabase-backed repositories and their integration tests are consequently also unverified against real Supabase — they compile and skip cleanly, but haven't run against a live database. Treat this as the top priority to close before trusting the Supabase repositories.

### Open follow-ups (not blocking, need you)

- Still: create the Supabase project(s) (dev + test) and populate `.env.local` (carried over from M0).
- Once created, apply `supabase/migrations/0001_init.sql` and set `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` (pointed at the **test** project) so the integration test suites actually run instead of skipping — this is the only way to validate the Supabase repository implementations and the migration SQL itself.

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
