import type { EmailClient, SendEmailInput } from "./types";

/** Scriptable EmailClient for tests — same pattern as FakeLLMProvider. */
export class FakeEmailClient implements EmailClient {
  readonly sent: SendEmailInput[] = [];
  private failWith: Error | null = null;

  /** Makes the next `send()` call(s) reject, to test non-fatal error handling at call sites. */
  scriptFailure(error: Error): void {
    this.failWith = error;
  }

  async send(input: SendEmailInput): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(input);
  }
}
