-- A second, text-only participant link for discovery studies
-- (see TEXT_DISCOVERY_INTERVIEW.md).
--
--   text_link_token       NULL (the default) means the study has no text link,
--                         so every existing study behaves exactly as before.
--                         Unique, like link_token, so one token finds one study.
--   participant_copy_text Landing and ending page text for the text link.
--                         NULL falls back to participant_copy.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations.
-- Purely additive: it adds two nullable columns and a unique index.

alter table studies
  add column text_link_token text unique,
  add column participant_copy_text jsonb;
