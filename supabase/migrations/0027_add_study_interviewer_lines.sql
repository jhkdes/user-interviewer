-- Per-study wording for two scripted interviewer lines (feedback studies):
-- first_message is what the voice agent says first, and closing_question is the
-- scripted "anything else?" question asked before the call closes. NULL (the
-- default) keeps today's wording, so every existing study behaves exactly as it
-- did.
--
-- Apply by hand in the Supabase SQL editor, as with the earlier migrations.
-- Purely additive: it adds two nullable columns, so the code that is already
-- deployed keeps working before and after.

alter table studies
  add column first_message text,
  add column closing_question text;
