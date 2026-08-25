import type { EmailClient, SendEmailInput } from "./types";

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 300;

/**
 * Marks a failure as worth retrying — a network blip or a Resend-side (5xx)
 * error. A 4xx (bad request, unverified domain, invalid `to`, etc) is never
 * retryable: retrying an identical request against the same misconfiguration
 * just wastes attempts and delays surfacing the real problem (see #6 — this
 * is exactly the shape of the "RESEND_API_KEY missing"/"domain not verified"
 * failures already hit in practice).
 */
class RetryableSendError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Thin server-only Resend REST client (#6) — same pattern as
 * `src/lib/vapi/client.ts`: a plain fetch call reading a private API key
 * from env, no SDK dependency. Retries transient failures (network errors,
 * 5xx responses) a few times with linear backoff; a non-retryable failure
 * (missing config, a 4xx response) throws immediately on the first attempt.
 * Still throws after retries are exhausted — callers decide whether that's
 * fatal, same as before (see `notification-service`'s non-fatal usage from
 * the webhook handler).
 */
export class ResendEmailClient implements EmailClient {
  constructor(
    private readonly maxAttempts = DEFAULT_MAX_ATTEMPTS,
    private readonly retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  ) {}

  private async sendOnce(input: SendEmailInput, apiKey: string, from: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: input.to,
          subject: input.subject,
          html: input.html,
        }),
      });
    } catch (cause) {
      throw new RetryableSendError(
        `Failed to reach Resend: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    }

    if (res.ok) return;

    const body = await res.text().catch(() => "");
    const message = `Resend API error (${res.status}): ${body}`;
    if (res.status >= 500) throw new RetryableSendError(message);
    throw new Error(message);
  }

  async send(input: SendEmailInput): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      throw new Error("Missing required environment variable: RESEND_API_KEY or RESEND_FROM_EMAIL");
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await this.sendOnce(input, apiKey, from);
        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxAttempts;
        if (!(error instanceof RetryableSendError) || isLastAttempt) throw error;
        await sleep(this.retryDelayMs * attempt);
      }
    }
  }
}
