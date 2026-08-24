-- Role/responsibility is no longer collected on the intake form (M13) — the
-- interviewer now asks for it conversationally as the opening question
-- instead, so it can no longer be guaranteed present at interview creation.
alter table interviews alter column role_description drop not null;
