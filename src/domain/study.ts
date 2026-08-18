export type StudyStatus = "open" | "closed";

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
  linkToken: string;
  status: StudyStatus;
  createdAt: Date;
  closedAt: Date | null;
}
