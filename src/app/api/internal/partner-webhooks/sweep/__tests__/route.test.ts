import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import { InMemoryPartnerWebhookDeliveryRepository } from "@/repositories/in-memory/in-memory-partner-webhook-delivery-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";

const deps = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/partner-webhooks/get-webhook-deps", () => ({
  getPartnerWebhookDeps: () => deps.current,
}));

import { GET, POST } from "../route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const request = (method: "GET" | "POST", authorization?: string) =>
  new Request("http://localhost/api/internal/partner-webhooks/sweep", {
    method,
    headers: authorization ? { authorization } : {},
  });

/** One partner interview with an event due, and a partner that answers 200. */
async function dueDelivery() {
  const deliveries = new InMemoryPartnerWebhookDeliveryRepository();
  const partners = new InMemoryPartnerRepository();
  const interviews = new InMemoryInterviewRepository();
  const studies = new InMemoryStudyRepository();
  const partner = await partners.create({
    name: "pfa-preview",
    keyHash: "a".repeat(64),
    webhookUrl: "https://pfa.example.com/hook",
    webhookSecret: "whsec_x",
  });
  const study = await studies.create({
    type: "feedback",
    title: "T",
    description: "D",
    preInterviewQuestions: [],
    linkToken: "l",
    partnerId: partner.id,
    ownerRef: "o",
  });
  const interview = await interviews.create({ studyId: study.id, firstName: "A", email: "a@x.co" });
  await interviews.update(interview.id, { status: "completed", completedAt: new Date() });
  const { delivery } = await deliveries.enqueue({
    partnerId: partner.id,
    studyId: study.id,
    interviewId: interview.id,
    event: "interview.completed",
    payload: { event: "interview.completed" },
    nextAttemptAt: new Date(Date.now() - 1000),
    expiresAt: new Date(Date.now() + 3600_000),
  });
  const fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
  deps.current = {
    deliveries,
    partners,
    interviews,
    studies,
    audioState: async () => "ready",
    fetch: fetchSpy,
  };
  return { deliveries, delivery, fetchSpy };
}

describe("partner webhook sweep route", () => {
  it("sends what is due for a request with the right secret, on GET and POST", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { deliveries, delivery, fetchSpy } = await dueDelivery();

    const response = await POST(request("POST", "Bearer s3cret"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checked: 1, delivered: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((await deliveries.getById(delivery.id))?.status).toBe("delivered");

    // GET (what Vercel Cron sends) works too, and finds nothing left to do.
    const again = await GET(request("GET", "Bearer s3cret"));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ checked: 0 });
  });

  it("refuses a missing or wrong secret without sending anything", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const { fetchSpy } = await dueDelivery();

    expect((await POST(request("POST"))).status).toBe(401);
    expect((await POST(request("POST", "Bearer nope"))).status).toBe(401);
    expect((await POST(request("POST", "s3cret"))).status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never runs when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetchSpy } = await dueDelivery();

    const response = await POST(request("POST", "Bearer anything"));

    expect(response.status).toBe(500);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers 500 without leaking the cause if the sweep itself breaks", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    deps.current = {
      deliveries: {
        listDue: async () => {
          throw new Error("password=hunter2");
        },
      },
    };

    const response = await POST(request("POST", "Bearer s3cret"));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("hunter2");
  });
});
