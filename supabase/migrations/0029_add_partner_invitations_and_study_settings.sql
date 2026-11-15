-- Partner API, step 3 (see partner-api-phase1/UI-PARTNER-API-SPEC.md, sections
-- 3.1-3.3 and 4):
--
--   studies.subject_name               Who the feedback is about (the partner's
--                                      user), for prompt tokens.
--   studies.ended_early_min_turns      A dropped call with fewer participant
--                                      turns than this shows "Your call ended
--                                      early". NULL keeps the standard value.
--   studies.target_minutes             Per-study interview length (NULL = the
--   studies.hard_stop_minutes          feedback defaults, 5 and 7 minutes).
--   studies.participant_summary_email  FALSE skips the participant summary and
--                                      its email. Defaults to TRUE, so every
--                                      existing study behaves as before.
--   partner_invitations                One colleague's personal link into a
--                                      partner study, with their context.
--   interviews.invitation_id           Which invitation an interview came from.
--   interviews.prompt_snapshot         The rendered prompt, opening line,
--                                      closing question and timing as they were
--                                      when the interview started, so changing
--                                      the study mid-interview does not change
--                                      the conversation.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations,
-- BEFORE deploying the code that reads these columns. Purely additive: the code
-- that is already deployed ignores all of it and keeps working. Requires
-- migration 0028 (partner studies).
--
-- RLS is enabled with no policies on the new table, like the others: the app
-- reads and writes through the service-role key, and anon/authenticated get
-- nothing.

alter table studies
  add column subject_name text,
  add column ended_early_min_turns integer,
  add column target_minutes integer,
  add column hard_stop_minutes integer,
  add column participant_summary_email boolean not null default true;

create table partner_invitations (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references studies (id) on delete cascade,
  tracking_id text not null,
  colleague_first_name text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (study_id, tracking_id)
);

alter table partner_invitations enable row level security;

alter table interviews
  add column invitation_id uuid references partner_invitations (id) on delete set null,
  add column prompt_snapshot jsonb;

create index interviews_invitation_id_idx on interviews (invitation_id);
