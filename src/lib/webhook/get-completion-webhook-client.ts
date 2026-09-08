import { HttpCompletionWebhookClient } from "./http-completion-webhook-client";
import type { CompletionWebhookClient } from "./types";

/** Resolves the live CompletionWebhookClient for API routes (server-only). */
export function getCompletionWebhookClient(): CompletionWebhookClient {
  return new HttpCompletionWebhookClient();
}
