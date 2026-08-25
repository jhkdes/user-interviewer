-- Security fix: Supabase flagged that RLS was not enabled on any table,
-- which means the public anon key (embedded in the browser bundle by
-- design) could be used to read/write/delete rows directly via the
-- PostgREST API, completely bypassing this app.
--
-- No policies are added deliberately: every real read/write in this app
-- goes through the server-only service-role key (see
-- src/lib/supabase/client.ts), which bypasses RLS entirely. The anon key is
-- only ever used client-side for Supabase Auth (`.auth.*` calls) — never for
-- `.from(table)` queries — so there is no legitimate anon/authenticated
-- access path to preserve. Enabling RLS with zero policies makes that
-- "deny all" the enforced default instead of an accident of app code never
-- happening to query these tables directly.
alter table studies enable row level security;
alter table interviews enable row level security;
alter table summaries enable row level security;
alter table study_reports enable row level security;
