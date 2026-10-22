-- Roles for dashboard users, and per-study grants for read-only viewers
-- (see VIEWER_ACCESS.md).
--
--   pm_roles             One row per dashboard user. 'admin' keeps today's full
--                        access; 'viewer' is read-only, limited to granted
--                        studies. A signed-in user with no row gets no access.
--   study_viewer_grants  Which studies a viewer may read.
--   viewer_invites       Invites that have not been accepted yet. The grant rows
--                        are created when the invite is accepted.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations,
-- and BEFORE deploying the middleware that reads pm_roles: with no table the
-- role lookup fails and every dashboard request returns 503.
--
-- After applying, create your first admin:
--   npm run create:pm-account -- --email=you@example.com --password=... --admin
-- or, for an account that already exists in Supabase Auth:
--   npm run set:pm-role -- --email=you@example.com --role=admin
--
-- RLS is enabled with no policies, like the other tables: the app reads and
-- writes through the service-role key, and anon/authenticated get nothing.

create table pm_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now()
);

create table study_viewer_grants (
  user_id uuid not null references auth.users (id) on delete cascade,
  study_id uuid not null references studies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, study_id)
);

create index study_viewer_grants_study_id_idx on study_viewer_grants (study_id);

create table viewer_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  study_ids uuid[] not null,
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

alter table pm_roles enable row level security;
alter table study_viewer_grants enable row level security;
alter table viewer_invites enable row level security;
