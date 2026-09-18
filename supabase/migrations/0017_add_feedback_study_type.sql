-- Adds a formal Study Type (discovery vs feedback) — see FEEDBACK_STUDY_TYPE.md
-- and GLOSSARY.md's "Study Type"/"Discovery"/"Feedback" entries. Existing
-- studies/summaries default to 'discovery' with empty feedback-only
-- fields, matching their actual current behavior exactly — no other
-- backfill needed.
alter table studies add column type text not null default 'discovery' check (type in ('discovery', 'feedback'));
alter table studies add column feedback_questions jsonb not null default '[]';

alter table interviews add column open_floor_asked_at timestamptz;

alter table summaries add column type text not null default 'discovery' check (type in ('discovery', 'feedback'));
alter table summaries add column liked jsonb not null default '[]';
alter table summaries add column disliked jsonb not null default '[]';
alter table summaries add column suggestions jsonb not null default '[]';
