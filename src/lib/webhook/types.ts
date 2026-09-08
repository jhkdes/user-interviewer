export interface CompletionWebhookPayload {
  participantTrackingId: string;
  interviewId: string;
  studyId: string;
  status: "completed";
  completedAt: string;
}

/**
 * The one interface every completion-webhook call site depends on — a
 * concrete provider (a plain HTTP POST for now) lives behind this, same
 * pattern as `EmailClient` (see `src/lib/email/types.ts`).
 */
export interface CompletionWebhookClient {
  send(payload: CompletionWebhookPayload): Promise<void>;
}
