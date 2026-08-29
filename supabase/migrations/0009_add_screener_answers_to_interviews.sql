-- Pre-call screener questionnaire answers (level, years of experience,
-- industry, etc.) collected on intake, shared with the AI interviewer as
-- context. Stored as a flexible JSON blob keyed by question id rather than
-- typed columns, since the question set may change before it's needed for
-- structured querying.
alter table interviews add column screener_answers jsonb;
