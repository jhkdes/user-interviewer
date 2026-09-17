export type StudyStatus = "open" | "closed";

export type VoiceProvider = "vapi" | "elevenlabs";

/**
 * A single pre-interview screener question, authored per study — either
 * AI-drafted from the study's title/description and then edited by the PM,
 * or edited from scratch. Always single/multi-select with options (never
 * free text) so answers stay structured; `allowOther` adds an "Other
 * (please specify)" free-text fallback per question.
 */
export interface PreInterviewQuestion {
  id: string;
  label: string;
  type: "single" | "multi";
  options: string[];
  allowOther?: boolean;
}

export interface Study {
  id: string;
  /** Short name for the study, e.g. "How AI Actually Shows Up in a PM's Day" — shown as the interview link's intro-screen heading and the study report's title. */
  title: string;
  /**
   * A noun phrase completing "A 15-minute AI-run interview about ___" (see
   * intro-screen.tsx) — e.g. "challenges in keeping financial statements
   * clean and reconciled", not a full standalone sentence. Also feeds the
   * interviewer's own "who you're talking to" framing (system-prompt.ts).
   */
  description: string;
  /**
   * The study's own pre-interview screener, shown at intake and answered
   * before the call starts. AI-drafted from title/description at creation
   * time, then PM-edited; can be regenerated/edited any time afterward, not
   * just at creation. Empty for a study that hasn't set any up yet.
   */
  preInterviewQuestions: PreInterviewQuestion[];
  /**
   * Optional free-text research focus set by the PM at study creation (e.g.
   * "dig into where participants use AI tools, where they've abandoned it,
   * and where they're anxious about it"). Woven into the interviewer's
   * system prompt to steer probing; `null` falls back to generic behavior.
   */
  researchTopic: string | null;
  /**
   * Optional full raw override of the interviewer's system prompt, pasted in
   * by the PM. When set, takes precedence over `researchTopic` (ignored)
   * and the generated Mom Test template entirely — see
   * buildInterviewSystemPrompt in system-prompt.ts. Supports the
   * `{{participant_name}}` placeholder.
   */
  customPrompt: string | null;
  linkToken: string;
  status: StudyStatus;
  /** Which voice platform runs this study's interview calls — set at creation by the researcher, lets whole studies be A/B tested against each other. */
  voiceProvider: VoiceProvider;
  createdAt: Date;
  closedAt: Date | null;
  /** Set when a PM extends the interview link's expiry — resets the 7-day expiry window (see link-validity.ts's checkLinkValidity) to start counting from this timestamp instead of `createdAt`. `null` until the link is ever extended. */
  linkExtendedAt: Date | null;
}
