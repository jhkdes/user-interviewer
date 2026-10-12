-- Custom text for a study's participant-facing landing and ending pages
-- (see src/domain/participant-copy.ts). NULL (the default) keeps the standard
-- wording, so every existing study looks exactly as it did.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations.
-- Purely additive: it adds one nullable column.

alter table studies
  add column participant_copy jsonb;
