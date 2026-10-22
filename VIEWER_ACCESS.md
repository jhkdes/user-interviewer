# Read-only viewer access — plan

## Goal

Let an external PM (a **viewer**) sign in and review a study's completed interviews, transcripts, audio, summaries, reports and config, without seeing who the participants are and without being able to change or delete anything. Admins (the existing PM role) keep today's full access.

**Status:** M1-M3 built on branch `add-viewer-access` (migration `0025` applied); M4-M5 not started. Until M4 there is no invite flow: give a viewer a role and a study with `set:pm-role` and a row in `study_viewer_grants`.

## Decisions (agreed)

| Topic              | Decision                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Access method      | Email invite. The viewer creates an account (Supabase Auth, email + password) and gets a `viewer` role.                                                                                          |
| Scope              | Per-study grants. One viewer can be granted several studies; no org-wide viewer role.                                                                                                            |
| Visible            | Raw transcripts, audio, per-interview summaries, study reports, study config (all read-only). Role description and screener answers are visible.                                                 |
| Hidden             | `first_name`, `email`, `tracking_id`, and any other participant identity field. The copy-participant-emails control.                                                                             |
| Participant label  | Stable pseudonym "Participant N", N = the interview's position by `created_at` within the study.                                                                                                 |
| Interviews shown   | Completed only, voice and text. In-progress, abandoned and test sessions are hidden.                                                                                                             |
| Transcript text    | As spoken, except the participant's own first name and email addresses, which are replaced. Other names or companies a participant says aloud stay visible; covered by an NDA, not by software.  |
| Exports            | None. No download buttons, no export pages, no export endpoints for viewers.                                                                                                                     |
| Lifecycle          | Manual revoke only. No expiry date, no access log.                                                                                                                                               |
| Admin bootstrap    | No PM accounts exist today. The first admin is created with `create:pm-account -- --admin`.                                                                                                      |
| Recording endpoint | `/api/interviews/[id]/recording` currently has no session check. It will require a session (admin, or a viewer granted that interview's study). Its only caller is the dashboard interview page. |

## Assumptions to confirm

1. **Participant first names appear in the data.** The interviewer greets participants by first name, so raw transcripts, and the summaries quoted from them, name the participant. Viewers therefore get the participant's own first name and any email address replaced with `[Participant]` / `[redacted email]` (a Unicode-aware pass in `src/viewer-access/redact-identity.ts`); everything else stays as spoken. Study reports are cleaned against every participant's name. Built in M2.
2. **Voice is identifying.** Audio is included by choice. This is an accepted risk, not something the software removes.
3. **"No downloads" is not leak-proof.** It removes buttons and endpoints; a viewer can still copy text or screenshot.
4. **Deny by default.** A signed-in user with no role row gets no access, including to existing routes.

## Current state (what the plan builds on)

- Auth is Supabase Auth only; there is no users/profile/role/org table. `studies` has no owner column. Any signed-in account has full access.
- `src/middleware.ts` only checks for a session, and only for `/dashboard/*` and `/api/studies/*`. `src/pm-auth/route-protection.ts` exempts any `/api/studies/*` path ending in `/interviews` (the public participant intake), which also exempts the PM-only `GET`/`DELETE` handlers under that path.
- All data access uses the service-role client (`src/lib/supabase/client.ts`); RLS is enabled with no policies. Authorization has to live in app code.
- Accounts are created by `scripts/create-pm-account.ts`. There is no sign-up or invite UI.
- Latest migration is `0024_add_study_text_link.sql`.

## Data model

New migration `0025`:

- `pm_roles (user_id uuid primary key references auth.users on delete cascade, role text not null check (role in ('admin','viewer')), created_at)`.
- `study_viewer_grants (user_id uuid references auth.users on delete cascade, study_id uuid references studies on delete cascade, created_at, primary key (user_id, study_id))`.
- `viewer_invites (id, email, study_ids uuid[], invited_by, created_at, accepted_at null, revoked_at null)`. Holds invites that have not been accepted yet; the grant rows are created on acceptance.
- RLS enabled with no policies, matching the other tables.

The migration seeds nothing. The first admin comes from the script.

## Authorization layer

- `src/pm-auth/` gains `getPmContext(request)` → `{ userId, email, role, grantedStudyIds } | null`, and `requireAdmin` / `requireStudyAccess(studyId)` helpers that return the 401/403/404 response.
- Middleware keeps its session check and adds: no role row → 403. Viewers are only allowed on an explicit allowlist (below); everything else is admin-only.
- **Viewer allowlist (GET only):** the viewer study list, a granted study's detail, interview list, interview detail, transcripts, summaries, report, config, and the recording route. Every `POST`/`PATCH`/`PUT`/`DELETE` is admin-only.
- Every study- and interview-scoped route checks the grant (viewers) and that the interview belongs to the study in the URL.
- Replace the `/interviews` suffix exemption with an exact match on the participant intake route (`POST` only), so the PM `GET`/`DELETE` handlers under it are no longer treated as public.
- `/api/interviews/[id]/recording`: add the matcher/handler check described above. Verify no participant-facing code calls it before changing it (checked once already: the only caller is `playable-recording-url.ts`).

## Viewer-safe projection

- A single mapper, `toViewerInterview(interview, position)`, is the only way viewer routes and pages produce interview data. It is an allowlist (it names the fields to keep), so new identity columns added later are hidden by default.
- Kept: pseudonym, `created_at`, `completed_at`, `mode`, `transcript`, `role_description`, `screener_answers`, recording playback.
- Dropped: `first_name`, `email`, `tracking_id`, call/conversation ids, device and idle fields, `recording_url` raw value (playback goes through the authenticated route).
- Summaries and reports pass through a viewer-safe step that applies the phase 3 findings.
- Filter to `status = 'completed'` in the repository query, not in the UI.

## Viewer UI

- A viewer lands on `/dashboard` showing only granted studies.
- Study page and interview page render a read-only variant: no delete, edit, close, extend-link, generate-report, redaction editor, export, copy-emails or participant-pages controls. The `export` and `edit` sub-routes return 403 for viewers.
- Admin study page gets a **Share** panel: invite by email (choose studies), list current viewers and pending invites, revoke.

## Invite flow

- Admin submits an email and studies → `viewer_invites` row → Supabase invite email.
- The viewer follows the link, sets a password (reusing `auth/callback` and the reset-password pages where possible), and on first sign-in the invite is accepted: `pm_roles` row = `viewer`, grants created, invite marked accepted.
- Inviting an email that already has an account adds grants without changing an admin to a viewer.
- Revoke removes a grant immediately; removing the last grant leaves the account with no visible studies. Removing the viewer entirely deletes the role row and bans the auth user.

## Milestones

Each milestone is shippable on its own and ends with `npm test`, `npm run lint` and a typecheck passing.

**M1 — Roles and the authorization layer (no behavior change for admins)**

- Migration `0025` (tables above), applied in Supabase.
- `create:pm-account -- --admin`; create the first admin.
- `getPmContext`, `requireAdmin`, `requireStudyAccess`; middleware: no role → 403, viewers blocked from everything not allowlisted.
- Fix the `/interviews` suffix exemption.
- Tests: unauthenticated 401, role-less user 403, admin unchanged, viewer 403 on every mutating route (table-driven over all `/api/studies/*` handlers so new routes are caught).
- **Done when:** the admin dashboard works exactly as before and a hand-made viewer row is refused on every write.

**M2 — Recording endpoint and viewer data projection**

- Require a session on `/api/interviews/[id]/recording`, with the grant check for viewers.
- `toViewerInterview`, completed-only query, pseudonym numbering.
- Strip the participant's name and emails from transcripts, summaries and reports (assumption 1).
- Not done in M2, moved to M3: the recording route serves ElevenLabs audio only. Vapi interviews play from a presigned URL embedded in the page, so M3 either proxies Vapi audio through the route for viewers or accepts that link as visible.
- Tests: recording 401 without session; viewer 403 on an ungranted study; serialized viewer output for a fixture contains none of `first_name`, `email`, `tracking_id` anywhere, including summaries and reports.
- **Done when:** a viewer-shaped API response can be produced and is proven free of identity fields.

**M3 — Viewer read-only UI**

- Read-only `/viewer` pages (study list, study, interview), separate from `/dashboard` so no admin control can appear on them. A viewer who opens a dashboard page is redirected to `/viewer`. The dashboard `export`/`edit` routes stay refused.
- The recording route also proxies Vapi audio (forwarding `Range`), so no presigned provider URL reaches a viewer.
- Component tests for viewer vs admin rendering; manual pass as a viewer, checking page source and network responses (not only what is visible).
- **Done when:** a granted viewer can read everything in scope and no write control or identity field is present in the HTML or API responses.

**M4 — Invite flow and Share panel**

- Invite, accept, add-grant-to-existing-account, revoke, remove viewer.
- Share panel on the admin study page.
- Tests for each transition, including an invite for an existing admin's email and a revoked invite.
- **Done when:** you can invite the PM by email, they sign up, see only the granted study, and revoking takes effect on their next request.

**M5 — Rollout**

- Short runbook (create admin, invite viewer, revoke), and a note in `README.md`.
- Walkthrough as a real viewer account against the real study before inviting the PM.
- Remind the PM of the NDA; list the accepted risks (voice, spoken names, screenshots).

## Risks

- Voices in audio can identify a participant.
- Transcript text, role descriptions and screener answers can name a person or company.
- Viewers can copy text or screenshot; there is no technical control for this.
- The authorization layer is a new, hand-enforced boundary on top of a service-role client that bypasses RLS. The table-driven route test in M1 and the allowlist-based projection in M2 exist to limit this risk; a route added later without a check is denied for viewers by default.
