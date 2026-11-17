-- Partner API: skipping the "A little about you" form.
--
--   studies.skip_intake   TRUE (the default) sends a partner colleague from the
--                         consent screen straight to the call or chat, without
--                         the first-name and email form: the invitation already
--                         carries their first name and no summary is emailed to
--                         them. FALSE keeps the form. Only partner studies read
--                         it, and a study with screener questions keeps the
--                         form either way. Existing partner studies get TRUE.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations,
-- BEFORE deploying the code that reads it. Purely additive: the code that is
-- already deployed ignores the column and keeps working.

alter table studies
  add column skip_intake boolean not null default true;
