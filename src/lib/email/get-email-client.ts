import { ResendEmailClient } from "./resend-client";
import type { EmailClient } from "./types";

/** Resolves the live EmailClient for API routes (server-only). */
export function getEmailClient(): EmailClient {
  return new ResendEmailClient();
}
