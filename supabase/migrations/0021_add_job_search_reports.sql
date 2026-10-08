-- Job-search report pipeline (see JOB_SEARCH_ROADMAP.md, milestone M4).
--
-- 1. Studies can opt in to a post-interview report pipeline. NULL (the default)
--    keeps today's behavior exactly: only the usual summary is produced.
-- 2. job_search_reports holds one report per interview: the extraction runs
--    behind it, the scores, the participant-facing report as generated and as
--    edited by a reviewer, and the state of its review and release.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations.
-- Purely additive: it adds a nullable column and a new table.

alter table studies
  add column report_pipeline text check (report_pipeline in ('job-search'));

create table job_search_reports (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references interviews (id) on delete cascade,
  study_id uuid not null references studies (id) on delete cascade,

  -- pending: waiting for the worker. generating: being worked on (or abandoned;
  -- a stale one is picked up again). draft: ready for a reviewer. released:
  -- the participant can open it. withdrawn: access removed. failed: the
  -- pipeline gave up (see error). skipped: not worth analyzing (see error).
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'draft', 'released', 'withdrawn', 'failed', 'skipped')),

  rubric_version text,

  -- Each completed extraction run (an evidence ledger), kept so a restart
  -- resumes instead of paying for the same runs again.
  extraction_runs jsonb not null default '[]',
  aggregate jsonb,
  scoring jsonb,
  pack jsonb,
  comparison jsonb,

  -- The report exactly as generated, and the current version a reviewer edits.
  generated_report jsonb,
  report jsonb,

  narrative_violations jsonb not null default '[]',
  text_violations jsonb not null default '[]',

  error text,
  attempts integer not null default 0,

  -- Set when the report is released; the participant's link is /report/<token>.
  access_token text unique,
  released_at timestamptz,
  released_by text,
  email_sent_at timestamptz,
  withdrawn_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index job_search_reports_study_id_idx on job_search_reports (study_id);
create index job_search_reports_status_idx on job_search_reports (status);

-- Same posture as every other table: all access goes through the server-only
-- service-role key, so RLS with no policies makes "deny all" the default for
-- the public anon key. The participant page reads a report only through the
-- server, by access token.
alter table job_search_reports enable row level security;
