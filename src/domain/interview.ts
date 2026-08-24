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
  /** No longer collected on the intake form (M13) — the interviewer asks for it conversationally as the opening question instead, so this stays `null` unless a future ticket backfills it from the transcript. */
  roleDescription: string | null;
  status: InterviewStatus;
  consentGivenAt: Date | null;
  transcript: TranscriptEntry[] | null;
  /**
   * Vapi-hosted call recording URL captured at end-of-call-report time — no
   * separate audio storage for MVP (see REQUIREMENTS.md). This specific URL
   * is not reliably playable (Vapi's HIPAA-compliant storage requires signed
   * requests); `vapiCallId` below is what dashboard playback actually uses
   * to fetch a fresh, working presigned URL on demand.
   */
  recordingUrl: string | null;
  /** Vapi's call id — used to fetch a fresh presigned recording URL from Vapi's REST API at view time, since presigned URLs expire (~33 min) and can't be stored once and reused indefinitely. */
  vapiCallId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}
