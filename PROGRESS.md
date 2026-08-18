# Implementation Progress Log

Tracks milestone completion against [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — what's done, what tests were run and their results, and any deviations from the plan (with reasoning) so decisions aren't lost. Update this file at the end of each milestone.

## Status Overview

| Milestone | Status | Date |
|---|---|---|
| M0 — Project Scaffolding | ✅ Complete | 2026-08-18 |
| M1 — Domain Model & Data Layer | ⬜ Not started | |
| M2 — LLM Provider Adapter | ⬜ Not started | |
| M3 — Interview Agent | ⬜ Not started | |
| M4 — Study & Link Management | ⬜ Not started | |
| M5 — Participant Intake | ⬜ Not started | |
| M6 — Voice Session Orchestration | ⬜ Not started | |
| M7 — Transcript Capture & Individual Summary | ⬜ Not started | |
| M8 — Study Report Generation | ⬜ Not started | |
| M9 — PM Authentication | ⬜ Not started | |
| M10 — PM Dashboard UI | ⬜ Not started | |
| M11 — Participant-Facing UI | ⬜ Not started | |
| M12 — End-to-End MVP Acceptance | ⬜ Not started | |

---

## M0 — Project Scaffolding ✅ (2026-08-18)

### Tickets completed
- **T0.1** — Next.js 14 (App Router, TypeScript, Tailwind) scaffolded; Vitest test runner added; Prettier + ESLint configured with `format`/`format:check` scripts.
- **T0.2** — Supabase client scaffolding: `src/lib/supabase/client.ts` (`createServerSupabaseClient`, service-role, server-only) with env-var validation; `.env.example` template added. *Actual Supabase project (dev + test) creation is a manual step — not done yet, see Open Follow-Ups below.*
- **T0.3** — GitHub Actions CI workflow added (`.github/workflows/ci.yml`): lint, typecheck, format check, test, on push/PR to `main`. *Inert until a GitHub remote exists — see Open Follow-Ups.*

### Tests run

| Command | Result |
|---|---|
| `npm test` (Vitest) | ✅ 2 test files, 4 tests passed — sanity test + `createServerSupabaseClient` (missing-`SUPABASE_URL`, missing-`SUPABASE_SERVICE_ROLE_KEY`, and happy-path construction) |
| `npm run lint` (`next lint`) | ✅ No ESLint warnings or errors |
| `npx tsc --noEmit` | ✅ No type errors |
| `npm run format:check` (Prettier) | ✅ All files match Prettier style |
| `npm run dev` + `curl localhost:3000` | ✅ Boots, returns HTTP 200 |

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
