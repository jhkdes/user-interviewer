import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateApiKey, hashApiKey } from "@/partner-api";
import { openApiDocument, schemaProblems } from "@/partner-api/__tests__/openapi-schema";
import { enqueueInterviewCompleted } from "@/partner-webhooks/enqueue";
import { InMemoryInterviewRepository } from "@/repositories/in-memory/in-memory-interview-repository";
import { InMemoryPartnerInvitationRepository } from "@/repositories/in-memory/in-memory-partner-invitation-repository";
import { InMemoryPartnerRepository } from "@/repositories/in-memory/in-memory-partner-repository";
import { InMemoryPartnerWebhookDeliveryRepository } from "@/repositories/in-memory/in-memory-partner-webhook-delivery-repository";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";

let partners = new InMemoryPartnerRepository();
let studies = new InMemoryStudyRepository();
let invitations = new InMemoryPartnerInvitationRepository();
let interviews = new InMemoryInterviewRepository();
vi.mock("@/repositories/get-partner-repository", () => ({ getPartnerRepository: () => partners }));
vi.mock("@/repositories/get-partner-rate-limit-repository", async () => {
  const { InMemoryPartnerRateLimitRepository } =
    await import("@/repositories/in-memory/in-memory-partner-rate-limit-repository");
  return { getPartnerRateLimitRepository: () => new InMemoryPartnerRateLimitRepository() };
});
vi.mock("@/repositories/get-partner-idempotency-repository", async () => {
  const { InMemoryPartnerIdempotencyRepository } =
    await import("@/repositories/in-memory/in-memory-partner-idempotency-repository");
  return { getPartnerIdempotencyRepository: () => new InMemoryPartnerIdempotencyRepository() };
});
vi.mock("@/repositories/get-study-repository", () => ({ getStudyRepository: () => studies }));
vi.mock("@/repositories/get-partner-invitation-repository", () => ({
  getPartnerInvitationRepository: () => invitations,
}));
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => interviews,
}));

import { GET as getInterview } from "../interviews/[interviewId]/route";
import { GET as getTranscript } from "../interviews/[interviewId]/transcript/route";
import { GET as getMe } from "../me/route";
import { GET as getInvitation } from "../studies/[studyId]/invitations/[trackingId]/route";
import {
  GET as listInvitations,
  POST as postInvitation,
} from "../studies/[studyId]/invitations/route";
import { GET as getStudy, PATCH as patchStudy } from "../studies/[studyId]/route";
import { POST as postStudy } from "../studies/route";

/**
 * Every response the real routes give is checked against partner-api-phase1/
 * openapi.yaml, so the published file cannot drift from the code.
 */

const TRACKING = "k3Zq9vX1mT8wRb4Yp7NcHd";
let key: string;
let partnerId: string;

beforeEach(async () => {
  partners = new InMemoryPartnerRepository();
  studies = new InMemoryStudyRepository();
  invitations = new InMemoryPartnerInvitationRepository();
  interviews = new InMemoryInterviewRepository();
  key = generateApiKey();
  partnerId = (await partners.create({ name: "pfa-preview", keyHash: hashApiKey(key) })).id;
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

const headers = (extra: Record<string, string> = {}) => ({
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  "X-Owner-Ref": "pfa_user_123",
  ...extra,
});

async function expectBody(response: Response, status: number, schema: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("X-Request-Id")).toBeTruthy();
  const body = await response.json();
  expect(schemaProblems(schema, body)).toEqual([]);
  return body;
}

const fullStudy = {
  ownerRef: "pfa_user_123",
  title: "Feedback for Jae Kim",
  subjectName: "Jae Kim",
  interviewPrompt: "Interview {{colleague_first_name}} about {{subject_name}}.",
  firstMessage: "Hi {{colleague_first_name}}, thanks for helping with {{subject_name}}.",
  closingQuestion: "Is there anything about Jae you would like to add?",
  timing: { targetMinutes: 6, hardStopMinutes: 9 },
  endedEarlyMinTurns: 3,
  participantSummaryEmail: true,
  landingCopy: {
    brandLabel: "Personal Feedback Agent",
    tagline: "Share some honest feedback.",
    facts: ["About 6 minutes", "Voice call"],
    steps: [{ title: "Press Start", body: "Allow the microphone." }],
    consentNote: "Pressing Start means you agree to be recorded.",
    endingTitle: "Thank you",
    endingMessage: "Your feedback has been shared.",
    contactEmail: "help@example.com",
    showFaq: true,
  },
};

describe("the published schemas match the routes", () => {
  it("describes GET /me", async () => {
    const response = await getMe(
      new Request("http://ui.test/api/partner/v1/me", { headers: headers() }),
      { params: {} },
    );
    const body = await expectBody(response, 200, "Me");
    expect(body.partner.name).toBe("pfa-preview");
  });

  it("describes studies, with and without every optional setting", async () => {
    for (const body of [
      fullStudy,
      { ...fullStudy, ownerRef: "pfa_user_min", title: "T", subjectName: "S", firstMessage: null },
    ]) {
      expect(schemaProblems("CreateStudy", body)).toEqual([]);
    }
    const minimal = {
      ownerRef: "pfa_user_min",
      title: "T",
      subjectName: "S",
      interviewPrompt: "Interview {{colleague_first_name}}.",
    };
    expect(schemaProblems("CreateStudy", minimal)).toEqual([]);

    const created = await postStudy(
      new Request("http://ui.test/api/partner/v1/studies", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(fullStudy),
      }),
      { params: {} },
    );
    const study = await expectBody(created, 201, "Study");

    const again = await postStudy(
      new Request("http://ui.test/api/partner/v1/studies", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(fullStudy),
      }),
      { params: {} },
    );
    await expectBody(again, 200, "Study");

    const bare = await postStudy(
      new Request("http://ui.test/api/partner/v1/studies", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(minimal),
      }),
      { params: {} },
    );
    await expectBody(bare, 201, "Study");

    const read = await getStudy(
      new Request(`http://ui.test/api/partner/v1/studies/${study.studyId}`, { headers: headers() }),
      { params: { studyId: study.studyId } },
    );
    await expectBody(read, 200, "Study");

    const patch = {
      title: "New title",
      firstMessage: null,
      timing: { targetMinutes: 4 },
      landingCopy: { tagline: null, showFaq: false },
    };
    expect(schemaProblems("UpdateStudy", patch)).toEqual([]);
    const patched = await patchStudy(
      new Request(`http://ui.test/api/partner/v1/studies/${study.studyId}`, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify(patch),
      }),
      { params: { studyId: study.studyId } },
    );
    await expectBody(patched, 200, "Study");
  });

  it("describes invitations, interviews and the transcript", async () => {
    const created = await postStudy(
      new Request("http://ui.test/api/partner/v1/studies", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(fullStudy),
      }),
      { params: {} },
    );
    const { studyId } = await created.json();

    const invitationBody = {
      trackingId: TRACKING,
      colleagueFirstName: "Priya",
      context: { work_context: "Worked together on the billing project" },
    };
    expect(schemaProblems("CreateInvitation", invitationBody)).toEqual([]);
    const invited = await postInvitation(
      new Request(`http://ui.test/api/partner/v1/studies/${studyId}/invitations`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(invitationBody),
      }),
      { params: { studyId } },
    );
    const invitation = await expectBody(invited, 201, "Invitation");
    expect(invitation.status).toBe("not_started");

    // An ended voice interview, a dropped one, and one still running.
    const make = async (extra: Parameters<InMemoryInterviewRepository["update"]>[1]) => {
      const interview = await interviews.create({
        studyId,
        firstName: "Priya",
        email: "priya@example.com",
        trackingId: TRACKING,
        voiceProvider: "elevenlabs",
        mode: "voice",
      });
      return interviews.update(interview.id, { invitationId: invitation.invitationId, ...extra });
    };
    const ended = await make({
      status: "completed",
      endCause: "finished",
      startedAt: new Date("2026-11-05T10:00:00.000Z"),
      completedAt: new Date("2026-11-05T10:05:12.000Z"),
      elevenLabsConversationId: "conv-1",
      transcript: [
        { speaker: "interviewer", text: "Hi Priya.", timestampMs: 0 },
        { speaker: "participant", text: "Hello!", timestampMs: 3000 },
      ],
    });
    const dropped = await make({
      status: "completed",
      endCause: "interrupted",
      startedAt: new Date("2026-11-05T11:00:00.000Z"),
      completedAt: new Date("2026-11-05T11:00:30.000Z"),
    });
    const running = await make({});

    for (const interview of [ended, dropped, running]) {
      const read = await getInterview(
        new Request(`http://ui.test/api/partner/v1/interviews/${interview.id}`, {
          headers: headers(),
        }),
        { params: { interviewId: interview.id } },
      );
      await expectBody(read, 200, "Interview");
    }

    const transcript = await getTranscript(
      new Request(`http://ui.test/api/partner/v1/interviews/${ended.id}/transcript`, {
        headers: headers(),
      }),
      { params: { interviewId: ended.id } },
    );
    const body = await expectBody(transcript, 200, "Transcript");
    expect(body.turns).toHaveLength(2);

    const one = await getInvitation(
      new Request(`http://ui.test/api/partner/v1/studies/${studyId}/invitations/${TRACKING}`, {
        headers: headers(),
      }),
      { params: { studyId, trackingId: TRACKING } },
    );
    const got = await expectBody(one, 200, "Invitation");
    expect(got.status).toBe("completed");
    expect(got.interviews).toHaveLength(3);

    const list = await listInvitations(
      new Request(`http://ui.test/api/partner/v1/studies/${studyId}/invitations`, {
        headers: headers(),
      }),
      { params: { studyId } },
    );
    expect(list.status).toBe(200);
    const page = await list.json();
    expect(page.nextCursor).toBeNull();
    for (const item of page.invitations) expect(schemaProblems("Invitation", item)).toEqual([]);
  });

  it("describes the error shape, including a validation error with details", async () => {
    const bad = await postStudy(
      new Request("http://ui.test/api/partner/v1/studies", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ownerRef: "", unknown: 1 }),
      }),
      { params: {} },
    );
    const body = await expectBody(bad, 400, "Error");
    expect(body.error.details?.length).toBeGreaterThan(1);

    const unauthorized = await postStudy(
      new Request("http://ui.test/api/partner/v1/studies", { method: "POST", body: "{}" }),
      { params: {} },
    );
    await expectBody(unauthorized, 401, "Error");

    const vapi = await postStudy(
      new Request("http://ui.test/api/partner/v1/studies", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ...fullStudy, voiceProvider: "vapi" }),
      }),
      { params: {} },
    );
    await expectBody(vapi, 422, "Error");
  });

  it("rejects values the schema forbids", () => {
    expect(
      schemaProblems("CreateInvitation", { trackingId: "short", colleagueFirstName: "P" }),
    ).not.toEqual([]);
    expect(schemaProblems("CreateStudy", { ...fullStudy, voiceProvider: "vapi" })).not.toEqual([]);
    expect(schemaProblems("CreateStudy", { ...fullStudy, surprise: true })).not.toEqual([]);
    expect(schemaProblems("Interview", { interviewId: "x" })).not.toEqual([]);
  });

  it("describes the webhook payload that is actually queued", async () => {
    const study = await studies.create({
      type: "feedback",
      title: "Feedback",
      description: "Jae",
      preInterviewQuestions: [],
      linkToken: "voice-token",
      partnerId,
      ownerRef: "pfa_user_123",
      voiceProvider: "elevenlabs",
    });
    const invitation = await invitations.create({
      studyId: study.id,
      trackingId: TRACKING,
      colleagueFirstName: "Priya",
      context: {},
    });
    const interview = await interviews.create({
      studyId: study.id,
      firstName: "Priya",
      email: "priya@example.com",
      trackingId: TRACKING,
      voiceProvider: "elevenlabs",
      mode: "voice",
    });
    await interviews.update(interview.id, {
      invitationId: invitation.id,
      status: "completed",
      endCause: "interrupted",
      completedAt: new Date("2026-11-05T10:05:12.000Z"),
    });
    await partners.updateWebhook(partnerId, {
      webhookUrl: "https://pfa.example.com/hook",
      webhookSecret: "whsec_test",
    });

    const queued = await enqueueInterviewCompleted(
      {
        deliveries: new InMemoryPartnerWebhookDeliveryRepository(),
        partners,
        interviews,
        studies,
        audioState: async () => ({ ready: true }) as never,
      },
      interview.id,
    );
    expect(queued).not.toBeNull();
    expect(schemaProblems("InterviewCompletedEvent", queued!.delivery.payload)).toEqual([]);
  });

  it("documents the rate limit on every operation and the idempotency key on every write", () => {
    const paths = openApiDocument.paths as Record<
      string,
      Record<string, { responses: Record<string, unknown>; parameters?: unknown[] }>
    >;
    const writes = [
      "post /studies",
      "patch /studies/{studyId}",
      "delete /studies/{studyId}",
      "post /studies/{studyId}/invitations",
      "delete /interviews/{interviewId}",
    ];
    for (const [path, item] of Object.entries(paths)) {
      for (const [method, operation] of Object.entries(item)) {
        if (method === "parameters") continue;
        expect(operation.responses["429"], `${method} ${path} lists 429`).toBeDefined();
        const takesKey = JSON.stringify(operation.parameters ?? []).includes("IdempotencyKey");
        expect(takesKey, `${method} ${path} idempotency key`).toBe(
          writes.includes(`${method} ${path}`),
        );
      }
    }
  });

  it("documents every route the API serves", () => {
    expect(Object.keys(openApiDocument.paths).sort()).toEqual([
      "/interviews/{interviewId}",
      "/interviews/{interviewId}/audio",
      "/interviews/{interviewId}/transcript",
      "/me",
      "/studies",
      "/studies/{studyId}",
      "/studies/{studyId}/invitations",
      "/studies/{studyId}/invitations/{trackingId}",
    ]);
  });
});
