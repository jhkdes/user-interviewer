-- Initial schema: studies, interviews, summaries, study_reports.
-- PM identity lives in Supabase Auth (auth.users) — no custom pm_accounts table for MVP.

create extension if not exists pgcrypto;

create table studies (
  id uuid primary key default gen_random_uuid(),
  industry text not null,
  years_of_experience text not null,
  job_title text not null,
  seniority text not null,
  responsibility text not null,
  link_token text not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table interviews (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references studies (id) on delete cascade,
  first_name text not null,
  email text not null,
  role_description text not null,
  status text not null default 'pending'
    check (status in ('pending', 'in-progress', 'completed', 'expired')),
  consent_given_at timestamptz,
  transcript jsonb,
  recording_url text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index interviews_study_id_idx on interviews (study_id);

create table summaries (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references interviews (id) on delete cascade,
  pain_points jsonb not null default '[]',
  notable_quotes jsonb not null default '[]',
  takeaways jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table study_reports (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references studies (id) on delete cascade,
  version integer not null,
  themes jsonb not null default '[]',
  generated_at timestamptz not null default now(),
  unique (study_id, version)
);

create index study_reports_study_id_idx on study_reports (study_id);
