export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

/**
 * The one interface every email call site depends on — concrete providers
 * (Resend, and whatever comes next) live behind this, same pattern as
 * `LLMProviderAdapter` (see `src/llm/types.ts`).
 */
export interface EmailClient {
  send(input: SendEmailInput): Promise<void>;
}
