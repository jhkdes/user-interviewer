import type { CompletionWebhookClient, CompletionWebhookPayload } from "./types";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 300;

/**
 * Marks a failure as worth retrying — a network blip or a 5xx from the
 * third party's endpoint. A 4xx (bad request, endpoint moved, auth
 * rejected, etc) is never retryable: retrying an identical request against
 * the same misconfiguration just wastes attempts — same reasoning as
 * `ResendEmailClient`'s `RetryableSendError` (see src/lib/email/resend-client.ts).
 */
class RetryableWebhookError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls a single, globally-configured webhook URL to tell a third-party
 * tool that a participant (identified by the tracking id it gave us on the
 * interview link) has completed their interview. Same pattern as
 * `ResendEmailClient`: plain `fetch`, URL read from env, a few retries with
 * linear backoff for transient failures. Still throws after retries are
 * exhausted — callers (notify-completion-webhook.ts) decide whether that's
 * fatal, same non-fatal posture as the summary email send.
 */
export class HttpCompletionWebhookClient implements CompletionWebhookClient {
  constructor(
    private readonly maxAttempts = DEFAULT_MAX_ATTEMPTS,
    private readonly retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  ) {}

  private async sendOnce(url: string, payload: CompletionWebhookPayload): Promise<void> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (cause) {
      throw new RetryableWebhookError(
        `Failed to reach completion webhook: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    if (res.ok) return;

    const body = await res.text().catch(() => "");
    const message = `Completion webhook error (${res.status}): ${body}`;
    if (res.status >= 500) throw new RetryableWebhookError(message);
    throw new Error(message);
  }

  async send(payload: CompletionWebhookPayload): Promise<void> {
    const url = process.env.PARTICIPANT_COMPLETION_WEBHOOK_URL;
    if (!url) {
      throw new Error("Missing required environment variable: PARTICIPANT_COMPLETION_WEBHOOK_URL");
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await this.sendOnce(url, payload);
        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxAttempts;
        if (!(error instanceof RetryableWebhookError) || isLastAttempt) throw error;
        await sleep(this.retryDelayMs * attempt);
      }
    }
  }
}
