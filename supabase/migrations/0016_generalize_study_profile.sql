-- Generalizes studies from a rigid TargetProfile (industry/years/job title/
-- seniority/responsibility) to a free-text title/description plus a
-- per-study AI-drafted, PM-edited pre-interview questionnaire — see
-- src/domain/study.ts's Study/PreInterviewQuestion and
-- INTERVIEW_SYSTEM_PROMPT.md-adjacent design notes. Multiple studies can now
-- explore genuinely different target profiles instead of sharing one
-- hardcoded global screener (src/participant-intake/screener-questions.ts,
-- now retired).
--
-- The old target-profile columns (industry, years_of_experience, job_title,
-- seniority, responsibility) are intentionally NOT dropped here — this
-- Supabase instance is shared across local/preview/prod. The app code no
-- longer reads or writes them; they're just inert until a later, separate
-- migration drops them once everyone's comfortable with that. They were
-- declared `not null` with no default back in 0001_init.sql though, so they
-- must be relaxed to nullable here — otherwise every new study created by
-- the new code (which no longer supplies them) would violate that
-- constraint on insert.
alter table studies alter column industry drop not null;
alter table studies alter column years_of_experience drop not null;
alter table studies alter column job_title drop not null;
alter table studies alter column seniority drop not null;
alter table studies alter column responsibility drop not null;

alter table studies add column title text not null default '';
alter table studies add column description text not null default '';
alter table studies add column pre_interview_questions jsonb not null default '[]';

-- Backfill for the 3 studies actually running today (found via a read-only
-- query against production), so their live intro page and screener aren't
-- interrupted by this migration — every other/unknown existing study keeps
-- the blank/empty defaults above and gets filled in later via the dashboard.
-- pre_interview_questions below is a direct transcription of the retired
-- global SCREENER_QUESTIONS list, same ids, so in-flight interviews and any
-- reporting keyed on those ids are unaffected.
update studies
set title = 'How AI Actually Shows Up in a PM''s Day',
    description = 'how product managers really use AI at work — the good, the bad, and what they don''t say out loud',
    pre_interview_questions = '[
      {
        "id": "level",
        "label": "What''s your current level?",
        "type": "single",
        "options": [
          "Associate PM / APM",
          "Product Manager (IC)",
          "Senior Product Manager",
          "Group PM / Principal PM",
          "Director of Product",
          "VP / Head of Product",
          "CPO / C-level"
        ],
        "allowOther": true
      },
      {
        "id": "yearsExperience",
        "label": "How many years have you worked as a PM (in any role)?",
        "type": "single",
        "options": [
          "Less than 1 year",
          "1–3 years",
          "3–6 years",
          "6–10 years",
          "10–15 years",
          "15+ years"
        ]
      },
      {
        "id": "industry",
        "label": "What industry is your company in?",
        "type": "single",
        "options": [
          "B2B SaaS / Enterprise Software",
          "Fintech / Financial Services",
          "Healthcare / Health Tech",
          "E-commerce / Retail",
          "Consumer / Social",
          "Developer Tools / Infrastructure",
          "Marketplace",
          "Hardware / Deep Tech",
          "Media / Entertainment"
        ],
        "allowOther": true
      },
      {
        "id": "companySize",
        "label": "How big is your company (by employee count)?",
        "type": "single",
        "options": [
          "Under 50 (early-stage startup)",
          "50–500 (growth stage)",
          "500–5,000 (mid-market)",
          "5,000+ (enterprise)"
        ]
      },
      {
        "id": "aiPolicy",
        "label": "Does your company have a clear policy or officially provided AI tools?",
        "type": "single",
        "options": [
          "Yes — clear policy and approved tool(s)",
          "Some tools provided, but no clear policy",
          "No policy and nothing officially provided",
          "Not sure"
        ]
      },
      {
        "id": "aiToolsUsed",
        "label": "Which AI tools do you actually use for work? (select all that apply)",
        "type": "multi",
        "options": [
          "ChatGPT",
          "Claude",
          "GitHub Copilot",
          "Cursor",
          "Notion AI",
          "A PM-specific tool (e.g., Productboard AI, Dovetail AI)",
          "An internal/company-built AI tool",
          "I don''t currently use AI tools at work"
        ],
        "allowOther": true
      },
      {
        "id": "researchSupport",
        "label": "Do you have dedicated user research support on your team?",
        "type": "single",
        "options": [
          "Yes, dedicated researcher(s)",
          "Shared or part-time access to a researcher",
          "No — I handle research myself",
          "Not sure / not applicable"
        ]
      },
      {
        "id": "pmTeamSize",
        "label": "How big is your PM team?",
        "type": "single",
        "options": ["Just me (solo PM)", "2–5 PMs", "6–15 PMs", "16+ PMs"]
      },
      {
        "id": "aiUsageFrequency",
        "label": "How often do you use AI tools in a typical work week?",
        "type": "single",
        "options": ["Multiple times a day", "About once a day", "A few times a week", "Rarely", "Never"]
      },
      {
        "id": "sideAiProject",
        "label": "Do you build or tinker with AI projects outside of work?",
        "type": "single",
        "options": ["Yes, regularly", "Yes, occasionally", "No, but I''d like to", "No, not interested"]
      }
    ]'::jsonb
where id in (
  '5d9a71b4-5099-4627-8e63-7678a4e909ba',
  '48ab357b-1fc8-4b4b-8b54-3a7a38d67de8',
  '51076f81-38f6-401a-9a12-f0487a019b98'
);
