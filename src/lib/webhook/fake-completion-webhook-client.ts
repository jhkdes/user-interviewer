import type { CompletionWebhookClient, CompletionWebhookPayload } from "./types";

/** Scriptable CompletionWebhookClient for tests — same pattern as FakeEmailClient. */
export class FakeCompletionWebhookClient implements CompletionWebhookClient {
  readonly sent: CompletionWebhookPayload[] = [];
  private failWith: Error | null = null;

  /** Makes the next `send()` call(s) reject, to test non-fatal error handling at call sites. */
  scriptFailure(error: Error): void {
    this.failWith = error;
  }

  async send(payload: CompletionWebhookPayload): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(payload);
  }
}
