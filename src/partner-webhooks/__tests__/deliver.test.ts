import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Interview, Partner, Study } from "@/domain";
import type { ConversationAudioState } from "@/lib/elevenlabs/client";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import { InMemoryPartnerWebhookDeliveryRepository } from "@/repositories/in-memory/in-memory-partner-webhook-delivery-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import {
  AUDIO_WAIT_MS,
  DELIVERY_WINDOW_MS,
  attemptDelivery,
  claimAndAttempt,
  retryDelayMs,
  runPartnerWebhookSweep,
  type WebhookDeps,
} from "../deliver";
import { createPartnerCompletionHook, enqueueInterviewCompleted } from "../enqueue";
import { signBody, verifySignature } from "../sign";

const T0 = new Date("2026-11-06T12:00:00.000Z");
const SECRET = "whsec_test_secret";
const URL_ = "https://pfa.example.com/hooks/ui";

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: string;
}

class Harness {
  deliveries = new InMemoryPartnerWebhookDeliveryRepository();
  partners = new InMemoryPartnerRepository();
  interviews = new InMemoryInterviewRepository();
  studies = new InMemoryStudyRepository();
  sent: Sent[] = [];
  /** What the partner answers with, in turn; the last one repeats. A function can also throw. */
  answers: Array<number | (() => never)> = [200];
  audio: ConversationAudioState = "ready";
  clock = T0;
  partner!: Partner;
  study!: Study;
  interview!: Interview;

  fakeFetch = (async (url: string, init: RequestInit) => {
    this.sent.push({
      url,
      headers: init.headers as Record<string, string>,
      body: init.body as string,
    });
    const answer = this.answers.length > 1 ? this.answers.shift()! : this.answers[0];
    if (typeof answer === "function") answer();
    return new Response(null, { status: answer as number });
  }) as unknown as typeof fetch;

  get deps(): WebhookDeps {
    return {
      deliveries: this.deliveries,
      partners: this.partners,
      interviews: this.interviews,
      studies: this.studies,
      audioState: async () => this.audio,
      fetch: this.fakeFetch,
      now: () => this.clock,
    };
  }

  async init(options: { webhook?: boolean; mode?: "voice" | "text" } = {}) {
    this.partner = await this.partners.create({
      name: "pfa-preview",
      keyHash: "a".repeat(64),
      ...(options.webhook === false ? {} : { webhookUrl: URL_, webhookSecret: SECRET }),
    });
    this.study = await this.studies.create({
      type: "feedback",
      title: "T",
      description: "D",
      preInterviewQuestions: [],
      linkToken: "l",
      partnerId: this.partner.id,
      ownerRef: "pfa_user_123",
      voiceProvider: "elevenlabs",
    });
    const interview = await this.interviews.create({
      studyId: this.study.id,
      firstName: "Priya",
      email: "p@example.com",
      trackingId: "t".repeat(22),
      voiceProvider: "elevenlabs",
      mode: options.mode ?? "voice",
    });
    this.interview = await this.interviews.update(interview.id, {
      status: "completed",
      endCause: "finished",
      invitationId: "inv-1",
      startedAt: new Date(T0.getTime() - 300_000),
      completedAt: T0,
      elevenLabsConversationId: options.mode === "text" ? null : "conv-1",
    });
    return this;
  }

  async queue() {
    const queued = await enqueueInterviewCompleted(this.deps, this.interview.id);
    if (!queued) throw new Error("nothing queued");
    return queued.delivery;
  }

  advance(ms: number) {
    this.clock = new Date(this.clock.getTime() + ms);
  }
}

let h: Harness;
beforeEach(async () => {
  h = await new Harness().init();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("signing", () => {
  it("signs the raw body with HMAC-SHA256 and prefixes it with sha256=", () => {
    // Known vector: HMAC-SHA256(key="key", message="The quick brown fox jumps over the lazy dog").
    expect(signBody("key", "The quick brown fox jumps over the lazy dog")).toBe(
      "sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    );
  });

  it("verifies a good signature and rejects a changed body, secret or format", () => {
    const signature = signBody(SECRET, '{"a":1}');

    expect(verifySignature(SECRET, '{"a":1}', signature)).toBe(true);
    expect(verifySignature(SECRET, '{"a":2}', signature)).toBe(false);
    expect(verifySignature("other", '{"a":1}', signature)).toBe(false);
    expect(verifySignature(SECRET, '{"a":1}', null)).toBe(false);
    expect(verifySignature(SECRET, '{"a":1}', "sha256=zz")).toBe(false);
  });
});

describe("queuing the event", () => {
  it("builds the spec's payload for a finished interview", async () => {
    const delivery = await h.queue();

    expect(delivery.payload).toEqual({
      event: "interview.completed",
      studyId: h.study.id,
      invitationId: "inv-1",
      trackingId: "t".repeat(22),
      interviewId: h.interview.id,
      status: "completed",
      endCause: "finished",
      occurredAt: T0.toISOString(),
    });
    expect(delivery.expiresAt.getTime()).toBe(T0.getTime() + DELIVERY_WINDOW_MS);
  });

  it("sends a dropped call as the same event, with endCause interrupted", async () => {
    await h.interviews.update(h.interview.id, { endCause: "interrupted" });

    const delivery = await h.queue();

    expect(delivery.payload).toMatchObject({
      event: "interview.completed",
      endCause: "interrupted",
    });
  });

  it("queues each interview's event only once", async () => {
    const first = await enqueueInterviewCompleted(h.deps, h.interview.id);
    const again = await enqueueInterviewCompleted(h.deps, h.interview.id);

    expect(first?.created).toBe(true);
    expect(again?.created).toBe(false);
    expect(again?.delivery.id).toBe(first?.delivery.id);
  });

  it("queues nothing for an interview that has not ended", async () => {
    await h.interviews.update(h.interview.id, { status: "in-progress" });

    expect(await enqueueInterviewCompleted(h.deps, h.interview.id)).toBeNull();
  });

  it("queues nothing for a study that belongs to no partner", async () => {
    const dashboardStudy = await h.studies.create({
      type: "feedback",
      title: "t",
      description: "d",
      preInterviewQuestions: [],
      linkToken: "dash",
    });
    const interview = await h.interviews.create({
      studyId: dashboardStudy.id,
      firstName: "D",
      email: "d@example.com",
    });
    await h.interviews.update(interview.id, { status: "completed", completedAt: T0 });

    expect(await enqueueInterviewCompleted(h.deps, interview.id)).toBeNull();
  });

  it("queues nothing when the partner has no webhook, or has been revoked", async () => {
    const bare = await new Harness().init({ webhook: false });
    expect(await enqueueInterviewCompleted(bare.deps, bare.interview.id)).toBeNull();

    await h.partners.revoke(h.partner.id);
    expect(await enqueueInterviewCompleted(h.deps, h.interview.id)).toBeNull();
  });
});

describe("sending", () => {
  it("posts the signed payload with the spec's headers and marks the delivery done", async () => {
    const delivery = await h.queue();

    const outcome = await claimAndAttempt(h.deps, delivery);

    expect(outcome).toBe("delivered");
    expect(h.sent).toHaveLength(1);
    const [request] = h.sent;
    expect(request.url).toBe(URL_);
    expect(request.headers["Content-Type"]).toBe("application/json");
    expect(request.headers["X-UI-Event"]).toBe("interview.completed");
    expect(request.headers["X-UI-Delivery"]).toBe(delivery.id);
    expect(request.headers["X-UI-Timestamp"]).toBe(String(Math.floor(T0.getTime() / 1000)));
    // A receiver can verify the signature over exactly the bytes it received.
    expect(verifySignature(SECRET, request.body, request.headers["X-UI-Signature"])).toBe(true);
    expect(JSON.parse(request.body)).toEqual(delivery.payload);

    const stored = await h.deliveries.getById(delivery.id);
    expect(stored).toMatchObject({
      status: "delivered",
      attempts: 1,
      lastStatusCode: 200,
      lastError: null,
    });
    expect(stored?.deliveredAt?.getTime()).toBe(T0.getTime());
  });

  it("does not send an event a second time once it is delivered", async () => {
    const delivery = await h.queue();
    await claimAndAttempt(h.deps, delivery);

    expect(await claimAndAttempt(h.deps, delivery)).toBeNull();
    expect(h.sent).toHaveLength(1);
  });

  it("does not send the same event from two workers at once", async () => {
    const delivery = await h.queue();

    const [a, b] = await Promise.all([
      claimAndAttempt(h.deps, delivery),
      claimAndAttempt(h.deps, delivery),
    ]);

    expect([a, b].filter((x) => x === "delivered")).toHaveLength(1);
    expect(h.sent).toHaveLength(1);
  });

  it.each([[400], [404], [500], [503]])(
    "retries a %i answer later and records why",
    async (status) => {
      h.answers = [status];
      const delivery = await h.queue();

      expect(await claimAndAttempt(h.deps, delivery)).toBe("retry");

      const stored = await h.deliveries.getById(delivery.id);
      expect(stored).toMatchObject({
        status: "pending",
        attempts: 1,
        lastStatusCode: status,
        lastError: `the partner answered HTTP ${status}`,
      });
      expect(stored?.nextAttemptAt.getTime()).toBe(T0.getTime() + retryDelayMs(1));
    },
  );

  it("treats a redirect as a failure and does not follow it", async () => {
    h.answers = [302];
    const delivery = await h.queue();

    expect(await claimAndAttempt(h.deps, delivery)).toBe("retry");
    expect((await h.deliveries.getById(delivery.id))?.lastStatusCode).toBe(302);
  });

  it("retries after a network error or a timeout, saying which", async () => {
    const delivery = await h.queue();

    h.answers = [
      () => {
        throw new TypeError("fetch failed");
      },
    ];
    await claimAndAttempt(h.deps, delivery);
    expect((await h.deliveries.getById(delivery.id))?.lastError).toBe(
      "the request could not be made",
    );

    h.advance(retryDelayMs(1) + 1000);
    h.answers = [
      () => {
        throw Object.assign(new Error("slow"), { name: "TimeoutError" });
      },
    ];
    await claimAndAttempt(h.deps, (await h.deliveries.getById(delivery.id))!);
    expect((await h.deliveries.getById(delivery.id))?.lastError).toBe("the request timed out");
  });

  it("backs off with growing delays, and delivers when the partner recovers", async () => {
    h.answers = [500, 500, 500, 200];
    const delivery = await h.queue();
    const delaysMinutes: number[] = [];

    for (let i = 0; i < 3; i++) {
      await claimAndAttempt(h.deps, (await h.deliveries.getById(delivery.id))!);
      const stored = (await h.deliveries.getById(delivery.id))!;
      delaysMinutes.push((stored.nextAttemptAt.getTime() - h.clock.getTime()) / 60_000);
      h.clock = stored.nextAttemptAt;
    }
    const final = await claimAndAttempt(h.deps, (await h.deliveries.getById(delivery.id))!);

    expect(delaysMinutes).toEqual([1, 5, 15]);
    expect(final).toBe("delivered");
    expect((await h.deliveries.getById(delivery.id))?.attempts).toBe(4);
  });

  it("caps the delay at six hours", () => {
    expect(retryDelayMs(1)).toBe(60_000);
    expect(retryDelayMs(7)).toBe(6 * 3600_000);
    expect(retryDelayMs(20)).toBe(6 * 3600_000);
  });

  it("gives up once the 24-hour window has passed, after a last try at its edge", async () => {
    h.answers = [500];
    const delivery = await h.queue();

    // Fail repeatedly until the window runs out.
    let current = delivery;
    let outcome: string | null = "retry";
    let guard = 0;
    while (outcome === "retry" && guard++ < 50) {
      h.clock = new Date(Math.max(h.clock.getTime(), current.nextAttemptAt.getTime()));
      outcome = await claimAndAttempt(h.deps, current);
      current = (await h.deliveries.getById(delivery.id))!;
    }

    expect(outcome).toBe("failed");
    const stored = (await h.deliveries.getById(delivery.id))!;
    expect(stored.status).toBe("failed");
    expect(stored.lastError).toBe("the partner answered HTTP 500");
    expect(h.clock.getTime()).toBeGreaterThanOrEqual(delivery.expiresAt.getTime());
    expect(h.clock.getTime() - T0.getTime()).toBeLessThanOrEqual(DELIVERY_WINDOW_MS + 1000);
    // Nothing more is due once it has failed.
    expect(
      await h.deliveries.listDue(new Date(h.clock.getTime() + 10 * DELIVERY_WINDOW_MS), 10),
    ).toEqual([]);
  });

  it("fails at once when the partner has been revoked, or the interview is gone, sending nothing", async () => {
    const delivery = await h.queue();
    await h.partners.revoke(h.partner.id);

    expect(await claimAndAttempt(h.deps, delivery)).toBe("failed");
    expect((await h.deliveries.getById(delivery.id))?.lastError).toMatch(/revoked/);

    const other = await new Harness().init();
    const queued = await other.queue();
    await other.interviews.delete(other.interview.id);
    expect(await claimAndAttempt(other.deps, queued)).toBe("failed");
    expect(h.sent).toHaveLength(0);
    expect(other.sent).toHaveLength(0);
  });

  it("keeps retrying, sending nothing, while the partner has no webhook address", async () => {
    const bare = await new Harness().init({ webhook: false });
    const { delivery } = await bare.deliveries.enqueue({
      partnerId: bare.partner.id,
      studyId: bare.study.id,
      interviewId: bare.interview.id,
      event: "interview.completed",
      payload: {},
      nextAttemptAt: T0,
      expiresAt: new Date(T0.getTime() + DELIVERY_WINDOW_MS),
    });

    expect(await claimAndAttempt(bare.deps, delivery)).toBe("retry");
    expect(bare.sent).toHaveLength(0);
    expect((await bare.deliveries.getById(delivery.id))?.lastError).toBe(
      "the partner has no webhook configured",
    );
  });
});

describe("waiting for the recording", () => {
  it("holds a voice interview's event back while the recording is not ready, without counting an attempt", async () => {
    h.audio = "pending";
    const delivery = await h.queue();

    expect(await claimAndAttempt(h.deps, delivery)).toBe("waiting");

    expect(h.sent).toHaveLength(0);
    const stored = await h.deliveries.getById(delivery.id);
    expect(stored).toMatchObject({
      status: "pending",
      attempts: 0,
      lastError: "waiting for the recording",
    });
    expect(stored!.nextAttemptAt.getTime()).toBeGreaterThan(T0.getTime());
  });

  it("sends once the recording appears", async () => {
    h.audio = "pending";
    const delivery = await h.queue();
    await claimAndAttempt(h.deps, delivery);

    h.audio = "ready";
    h.advance(60_000);
    expect(await claimAndAttempt(h.deps, (await h.deliveries.getById(delivery.id))!)).toBe(
      "delivered",
    );
  });

  it("sends at once when the provider says there is no recording and there will not be one", async () => {
    h.audio = "none";

    expect(await claimAndAttempt(h.deps, await h.queue())).toBe("delivered");
  });

  it("sends anyway after ten minutes of waiting, whether the provider says pending or cannot be reached", async () => {
    for (const state of ["pending", "unknown"] as const) {
      const x = await new Harness().init();
      x.audio = state;
      const delivery = await x.queue();
      x.advance(AUDIO_WAIT_MS + 1000);

      expect(await claimAndAttempt(x.deps, delivery)).toBe("delivered");
    }
  });

  it("does not ask about a recording for a typed interview", async () => {
    const typed = await new Harness().init({ mode: "text" });
    typed.audio = "pending";

    expect(await claimAndAttempt(typed.deps, await typed.queue())).toBe("delivered");
  });
});

describe("the completion hook", () => {
  it("queues and sends straight away", async () => {
    await createPartnerCompletionHook(h.deps)(h.interview.id);

    expect(h.sent).toHaveLength(1);
    expect((await h.deliveries.getByInterview(h.interview.id, "interview.completed"))?.status).toBe(
      "delivered",
    );
  });

  it("leaves the event queued for the sweep when the first try fails", async () => {
    h.answers = [503];

    await createPartnerCompletionHook(h.deps)(h.interview.id);

    const stored = await h.deliveries.getByInterview(h.interview.id, "interview.completed");
    expect(stored).toMatchObject({ status: "pending", attempts: 1 });
  });

  it("does nothing when called again for an interview already queued", async () => {
    const hook = createPartnerCompletionHook(h.deps);
    await hook(h.interview.id);
    await hook(h.interview.id);

    expect(h.sent).toHaveLength(1);
  });
});

describe("the sweep", () => {
  it("sends what is due and leaves what is not", async () => {
    const due = await h.queue();
    // A second delivery, scheduled for later.
    const interview2 = await h.interviews.create({
      studyId: h.study.id,
      firstName: "S",
      email: "s@x.co",
    });
    await h.interviews.update(interview2.id, {
      status: "completed",
      completedAt: T0,
      endCause: "finished",
    });
    const queuedLater = await h.deliveries.enqueue({
      partnerId: h.partner.id,
      studyId: h.study.id,
      interviewId: interview2.id,
      event: "interview.completed",
      payload: {},
      nextAttemptAt: new Date(T0.getTime() + 3600_000),
      expiresAt: new Date(T0.getTime() + DELIVERY_WINDOW_MS),
    });

    const result = await runPartnerWebhookSweep(h.deps);

    expect(result).toMatchObject({ checked: 1, delivered: 1, retried: 0, failed: 0 });
    expect((await h.deliveries.getById(due.id))?.status).toBe("delivered");
    expect((await h.deliveries.getById(queuedLater.delivery.id))?.status).toBe("pending");
  });

  it("retries a failed one on a later run and counts outcomes", async () => {
    h.answers = [500, 200];
    const delivery = await h.queue();

    expect(await runPartnerWebhookSweep(h.deps)).toMatchObject({ checked: 1, retried: 1 });
    expect(await runPartnerWebhookSweep(h.deps)).toMatchObject({ checked: 0 });
    h.advance(retryDelayMs(1) + 1000);
    expect(await runPartnerWebhookSweep(h.deps)).toMatchObject({ checked: 1, delivered: 1 });
    expect((await h.deliveries.getById(delivery.id))?.attempts).toBe(2);
  });

  it("stops at its limit and leaves the rest for the next run", async () => {
    await h.queue();
    for (let i = 0; i < 3; i++) {
      const extra = await h.interviews.create({
        studyId: h.study.id,
        firstName: "X",
        email: "x@x.co",
      });
      await h.interviews.update(extra.id, {
        status: "completed",
        completedAt: T0,
        endCause: "finished",
      });
      await h.deliveries.enqueue({
        partnerId: h.partner.id,
        studyId: h.study.id,
        interviewId: extra.id,
        event: "interview.completed",
        payload: {},
        nextAttemptAt: T0,
        expiresAt: new Date(T0.getTime() + DELIVERY_WINDOW_MS),
      });
    }

    const result = await runPartnerWebhookSweep(h.deps, { limit: 2 });

    expect(result.checked).toBe(2);
    expect(result.deferred).toBeGreaterThan(0);
    expect((await h.deliveries.listDue(T0, 10)).length).toBeGreaterThan(0);
  });

  it("is harmless when nothing is due", async () => {
    expect(await runPartnerWebhookSweep(h.deps)).toEqual({
      checked: 0,
      delivered: 0,
      retried: 0,
      failed: 0,
      waiting: 0,
      deferred: 0,
    });
  });
});

describe("attemptDelivery", () => {
  it("never throws, whatever the partner does", async () => {
    h.answers = [
      () => {
        throw new Error("boom");
      },
    ];
    const delivery = await h.queue();

    await expect(attemptDelivery(h.deps, delivery)).resolves.toBe("retry");
  });
});
