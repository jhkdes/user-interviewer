import type { PreInterviewQuestion } from "@/domain";

/**
 * Configuration for the "How Job Seekers Get Interviews" study. The source of
 * truth for the *content* is JOB_SEARCH_SCORING_MODEL.md section 6 (screener)
 * and JOB_SEARCH_INTERVIEWER_PROMPT.md (prompt) — keep this file in sync with
 * the former by hand.
 *
 * Question ids are stable and human-readable on purpose: screener answers are
 * stored and shown to the interviewer keyed by id (see formatScreenerContext in
 * interview-agent/system-prompt.ts), and the report pipeline reads them by id.
 * Rewording a label must never change its id.
 */

export const JOB_SEARCH_STUDY_TITLE = "How Job Seekers Get Interviews";

/** Noun phrase completing "A 15-minute AI-run interview about ___" on the intro screen. */
export const JOB_SEARCH_STUDY_DESCRIPTION =
  "how you're searching for your next job and what leads to interviews";

export const JOB_SEARCH_SCREENER: PreInterviewQuestion[] = [
  {
    id: "search_status",
    label: "What is your current job search status?",
    type: "single",
    options: [
      "Actively searching for a new job",
      "Casually looking or open to opportunities",
      "Not currently searching but planning to soon",
      "Recently stopped searching (accepted an offer)",
      "Recently stopped searching (paused for another reason)",
    ],
    allowOther: false,
  },
  {
    id: "time_since_full_time",
    label: "How long has it been since your last full-time role?",
    type: "single",
    options: [
      "I am currently employed full-time",
      "Less than 3 months",
      "3 to 6 months",
      "6 to 12 months",
      "More than 12 months",
      "I have not had a full-time role",
    ],
    allowOther: false,
  },
  {
    id: "search_duration",
    label: "How long have you been actively searching for your next job?",
    type: "single",
    options: [
      "Less than 2 weeks",
      "2 weeks to 1 month",
      "1 to 3 months",
      "3 to 6 months",
      "6 to 12 months",
      "More than 12 months",
    ],
    allowOther: false,
  },
  {
    id: "target_function",
    label: "What type of role or function are you mainly targeting?",
    type: "multi",
    options: [
      "Product or program management",
      "Software or hardware engineering",
      "Data or analytics",
      "Design or user research",
      "Marketing or communications",
      "Sales or business development",
      "Customer success or support",
      "Operations or supply chain",
      "Finance or accounting",
      "People, HR, or recruiting",
      "Legal, risk, or compliance",
      "Education or training",
      "Healthcare or clinical",
      "General management or leadership",
    ],
    allowOther: true,
  },
  {
    id: "current_level",
    label: "Which best describes your most recent or current level?",
    type: "single",
    options: [
      "Entry-level or early career",
      "Mid-level individual contributor",
      "Senior individual contributor",
      "Manager",
      "Director",
      "Executive or C-level",
    ],
    allowOther: false,
  },
  {
    id: "target_level_vs_recent",
    label: "Compared with your most recent role, the level you are targeting is:",
    type: "single",
    options: ["Higher", "About the same", "Lower", "A mix of levels", "Not sure yet"],
    allowOther: false,
  },
  {
    id: "applications_30d",
    label: "Roughly how many job applications have you submitted in the past month?",
    type: "single",
    options: ["0 to 5", "6 to 15", "16 to 30", "31 to 50", "More than 50"],
    allowOther: false,
  },
  {
    id: "conversations_total",
    label:
      "Since you started searching, roughly how many recruiter conversations or interviews have you had?",
    type: "single",
    options: ["None yet", "1 to 2", "3 to 5", "6 to 10", "More than 10"],
    allowOther: false,
  },
  {
    id: "channels_used",
    label: "Which of these have you used to find opportunities? Select all that apply.",
    type: "multi",
    options: [
      "General job boards (such as LinkedIn or Indeed)",
      "Niche or industry job boards, newsletters, or listings",
      "Company career pages",
      "Job alerts or saved searches",
      "Referrals from people I know",
      "Reaching out to hiring managers or employees I do not know",
      "Recruiters who contacted me",
      "Recruiters I sought out or work with",
      "Former colleagues or my professional network",
      "Communities, events, or online groups",
      "Posting or sharing content",
    ],
    allowOther: true,
  },
  {
    id: "ai_uses",
    label: "Where have you used AI in your job search? Select all that apply.",
    type: "multi",
    options: [
      "Tailoring my resume",
      "Writing cover letters",
      "Researching companies or roles",
      "Deciding whether I am a good fit for a role",
      "Preparing for interviews",
      "Writing outreach messages",
      "Finding jobs to apply to",
      "Applying to jobs automatically",
      "I have not used AI in my search",
    ],
    allowOther: true,
  },
  {
    id: "search_support",
    label: "Are you getting any support with your job search? Select all that apply.",
    type: "multi",
    options: [
      "No support",
      "A paid career coach",
      "Outplacement support paid for by a former employer",
      "A free program (for example, a workforce, alumni, or community program)",
    ],
    allowOther: true,
  },
  {
    id: "career_pivot",
    label: "Is the role or industry you are targeting different from your previous one?",
    type: "single",
    options: [
      "No, a similar role in the same industry",
      "Yes, a different role in the same industry",
      "Yes, a similar role in a different industry",
      "Yes, a different role in a different industry",
      "Not sure",
    ],
    allowOther: false,
  },
];
