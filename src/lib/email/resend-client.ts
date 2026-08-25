import type { EmailClient, SendEmailInput } from "./types";

/**
 * Thin server-only Resend REST client (#6) — same pattern as
 * `src/lib/vapi/client.ts`: a plain fetch call reading a private API key
 * from env, no SDK dependency. Throws on any failure (missing config, a
 * non-2xx response, or a network error); callers decide whether that's
 * fatal — see `notification-service`'s non-fatal usage from the webhook
 * handler, the same pattern already established for summary generation.
 */
export class ResendEmailClient implements EmailClient {
  async send(input: SendEmailInput): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      throw new Error("Missing required environment variable: RESEND_API_KEY or RESEND_FROM_EMAIL");
    }

    const res = await fetch("https://api.resend.com/emails", {
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

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend API error (${res.status}): ${body}`);
    }
  }
}
