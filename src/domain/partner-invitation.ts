/**
 * One colleague's personal link into a partner study (see partner-api-phase1/
 * UI-PARTNER-API-SPEC.md, section 3.2). The `trackingId` is the secret that
 * separates one colleague's invitation from another's, so it must be random.
 */
export interface PartnerInvitation {
  id: string;
  studyId: string;
  /** Unique within the study; carried on the participant link as `tracking_id`. */
  trackingId: string;
  /** The colleague's first name, as the study owner gave it; the interviewer uses it. */
  colleagueFirstName: string;
  /** Free-form string map, e.g. `{ workContext: "We worked on the 2024 billing migration." }`. */
  context: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * What an interview was started with, frozen when it began so that updating the
 * study afterward does not change a conversation already under way.
 */
export interface InterviewSnapshot {
  /** The interviewer's full prompt with every token filled in. */
  prompt: string;
  /** The rendered opening line, or null for the voice agent's built-in greeting. */
  firstMessage: string | null;
  /** The rendered closing question, or null for the standard one. */
  closingQuestion: string | null;
  targetMinutes: number;
  hardStopMinutes: number;
}
