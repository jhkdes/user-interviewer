export type InterviewStatus = "pending" | "in-progress" | "completed" | "expired";

export interface TranscriptEntry {
  speaker: "interviewer" | "participant";
  text: string;
  timestampMs: number;
}

export interface Interview {
  id: string;
  studyId: string;
  firstName: string;
  email: string;
  roleDescription: string;
  status: InterviewStatus;
  consentGivenAt: Date | null;
  transcript: TranscriptEntry[] | null;
  /** Vapi-hosted call recording URL — no separate audio storage for MVP (see REQUIREMENTS.md). */
  recordingUrl: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}
