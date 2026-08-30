export type StudyStatus = "open" | "closed";

export type VoiceProvider = "vapi" | "elevenlabs";

/**
 * Free-text fields the "New Study" form prompts for, per REQUIREMENTS.md —
 * kept as discrete fields (not one blob) so the form stays consistent across
 * studies, while each field itself stays plain text rather than a rigid enum.
 */
export interface TargetProfile {
  industry: string;
  yearsOfExperience: string;
  jobTitle: string;
  seniority: string;
  responsibility: string;
}

export interface Study {
  id: string;
  targetProfile: TargetProfile;
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
   * buildInterviewSystemPrompt in system-prompt.ts. Supports
   * `{{participant_name}}` and `{{participant_role}}` placeholders.
   */
  customPrompt: string | null;
  linkToken: string;
  status: StudyStatus;
  /** Which voice platform runs this study's interview calls — set at creation by the researcher, lets whole studies be A/B tested against each other. */
  voiceProvider: VoiceProvider;
  createdAt: Date;
  closedAt: Date | null;
}
