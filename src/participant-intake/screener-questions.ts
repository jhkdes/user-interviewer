export interface ScreenerQuestion {
  id: string;
  label: string;
  type: "single" | "multi";
  options: string[];
  allowOther?: boolean;
}

/**
 * Pre-call screener for the "How AI Actually Shows Up in a PM's Day" study —
 * hardcoded to this study's exact question set rather than a study-configurable
 * schema, since it's the only study using it today. If a second study needs a
 * different screener, generalize this into per-Study config then.
 */
export const SCREENER_QUESTIONS: ScreenerQuestion[] = [
  {
    id: "level",
    label: "What's your current level?",
    type: "single",
    options: [
      "Associate PM / APM",
      "Product Manager (IC)",
      "Senior Product Manager",
      "Group PM / Principal PM",
      "Director of Product",
      "VP / Head of Product",
      "CPO / C-level",
    ],
    allowOther: true,
  },
  {
    id: "yearsExperience",
    label: "How many years have you worked as a PM (in any role)?",
    type: "single",
    options: [
      "Less than 1 year",
      "1–3 years",
      "3–6 years",
      "6–10 years",
      "10–15 years",
      "15+ years",
    ],
  },
  {
    id: "industry",
    label: "What industry is your company in?",
    type: "single",
    options: [
      "B2B SaaS / Enterprise Software",
      "Fintech / Financial Services",
      "Healthcare / Health Tech",
      "E-commerce / Retail",
      "Consumer / Social",
      "Developer Tools / Infrastructure",
      "Marketplace",
      "Hardware / Deep Tech",
      "Media / Entertainment",
    ],
    allowOther: true,
  },
  {
    id: "companySize",
    label: "How big is your company (by employee count)?",
    type: "single",
    options: [
      "Under 50 (early-stage startup)",
      "50–500 (growth stage)",
      "500–5,000 (mid-market)",
      "5,000+ (enterprise)",
    ],
  },
  {
    id: "aiPolicy",
    label: "Does your company have a clear policy or officially provided AI tools?",
    type: "single",
    options: [
      "Yes — clear policy and approved tool(s)",
      "Some tools provided, but no clear policy",
      "No policy and nothing officially provided",
      "Not sure",
    ],
  },
  {
    id: "aiToolsUsed",
    label: "Which AI tools do you actually use for work? (select all that apply)",
    type: "multi",
    options: [
      "ChatGPT",
      "Claude",
      "GitHub Copilot",
      "Cursor",
      "Notion AI",
      "A PM-specific tool (e.g., Productboard AI, Dovetail AI)",
      "An internal/company-built AI tool",
      "I don't currently use AI tools at work",
    ],
    allowOther: true,
  },
  {
    id: "researchSupport",
    label: "Do you have dedicated user research support on your team?",
    type: "single",
    options: [
      "Yes, dedicated researcher(s)",
      "Shared or part-time access to a researcher",
      "No — I handle research myself",
      "Not sure / not applicable",
    ],
  },
  {
    id: "pmTeamSize",
    label: "How big is your PM team?",
    type: "single",
    options: ["Just me (solo PM)", "2–5 PMs", "6–15 PMs", "16+ PMs"],
  },
  {
    id: "aiUsageFrequency",
    label: "How often do you use AI tools in a typical work week?",
    type: "single",
    options: ["Multiple times a day", "About once a day", "A few times a week", "Rarely", "Never"],
  },
  {
    id: "sideAiProject",
    label: "Do you build or tinker with AI projects outside of work?",
    type: "single",
    options: ["Yes, regularly", "Yes, occasionally", "No, but I'd like to", "No, not interested"],
  },
];
