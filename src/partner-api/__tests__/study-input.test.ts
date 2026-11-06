import { describe, expect, it } from "vitest";
import { InMemoryStudyRepository } from "@/repositories/in-memory/in-memory-study-repository";
import { parseCreateStudy, parseInvitation, parsePatchStudy } from "../study-input";

const valid = {
  ownerRef: "pfa_user_123",
  title: "Feedback for Jae Kim",
  subjectName: "Jae Kim",
  interviewPrompt: "Interview {{colleague_first_name}} about {{subject_name}}.",
};

async function aStudy() {
  const repo = new InMemoryStudyRepository();
  return repo.create({
    type: "feedback",
    title: "T",
    description: "D",
    preInterviewQuestions: [],
    linkToken: "l",
    partnerId: "p1",
    ownerRef: "pfa_user_123",
    subjectName: "Jae Kim",
    voiceProvider: "elevenlabs",
  });
}

describe("parseCreateStudy", () => {
  it("accepts the minimum and fills the defaults", () => {
    const result = parseCreateStudy(valid);

    expect(result).toMatchObject({
      ok: true,
      value: {
        ownerRef: "pfa_user_123",
        subjectName: "Jae Kim",
        firstMessage: null,
        closingQuestion: null,
        targetMinutes: 5,
        hardStopMinutes: 7,
        endedEarlyMinTurns: 4,
        participantSummaryEmail: false,
        participantCopy: null,
      },
    });
  });

  it("takes every optional setting", () => {
    const result = parseCreateStudy({
      ...valid,
      voiceProvider: "elevenlabs",
      firstMessage: "Hi {{colleague_first_name}}.",
      closingQuestion: "Anything to add about {{subject_name}}?",
      timing: { targetMinutes: 6, hardStopMinutes: 10 },
      endedEarlyMinTurns: 3,
      participantSummaryEmail: true,
      landingCopy: { brandLabel: "PFA", endingTitle: "Done", showFaq: true },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        firstMessage: "Hi {{colleague_first_name}}.",
        targetMinutes: 6,
        hardStopMinutes: 10,
        endedEarlyMinTurns: 3,
        participantSummaryEmail: true,
        participantCopy: {
          intro: { brandLabel: "PFA", showFaq: true },
          completion: { title: "Done" },
        },
      },
    });
  });

  it("refuses vapi as an unsupported provider, and anything else as invalid", () => {
    expect(parseCreateStudy({ ...valid, voiceProvider: "vapi" })).toMatchObject({
      ok: false,
      kind: "unsupported_provider",
    });
    expect(parseCreateStudy({ ...valid, voiceProvider: "other" })).toMatchObject({
      ok: false,
      kind: "invalid",
    });
  });

  it.each([
    ["a missing owner", { ...valid, ownerRef: undefined }, /ownerRef/],
    ["a blank title", { ...valid, title: "  " }, /title/],
    ["a missing subject", { ...valid, subjectName: undefined }, /subjectName/],
    ["a missing prompt", { ...valid, interviewPrompt: undefined }, /interviewPrompt/],
    ["an unknown field", { ...valid, colour: "red" }, /unknown field "colour"/],
    ["an unclosed conditional", { ...valid, interviewPrompt: "{{#if a}}x" }, /no matching/],
    ["an over-long opening line", { ...valid, firstMessage: "x".repeat(301) }, /firstMessage/],
    ["a hard stop above 25", { ...valid, timing: { hardStopMinutes: 26 } }, /at most 25/],
    ["a target at or above the hard stop", { ...valid, timing: { targetMinutes: 7 } }, /less than/],
    ["a fractional target", { ...valid, timing: { targetMinutes: 2.5 } }, /whole number/],
    ["a bad ended-early threshold", { ...valid, endedEarlyMinTurns: 0 }, /endedEarlyMinTurns/],
    ["a non-boolean summary flag", { ...valid, participantSummaryEmail: "no" }, /true or false/],
    [
      "an unknown landing field",
      { ...valid, landingCopy: { colour: "red" } },
      /landingCopy: unknown/,
    ],
    ["a bad contact email", { ...valid, landingCopy: { contactEmail: "nope" } }, /contact email/],
  ])("rejects %s", (_label, body, message) => {
    const result = parseCreateStudy(body);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" | ")).toMatch(message);
  });

  it("rejects a body that is not an object, and reports every problem at once", () => {
    expect(parseCreateStudy("hello").ok).toBe(false);
    const result = parseCreateStudy({ title: 5 });
    expect(result.ok === false && result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("parsePatchStudy", () => {
  it("accepts a partial change", async () => {
    const study = await aStudy();

    const result = parsePatchStudy(
      { interviewPrompt: "New prompt", endedEarlyMinTurns: 5, participantSummaryEmail: true },
      study,
    );

    expect(result).toEqual({
      ok: true,
      value: { customPrompt: "New prompt", endedEarlyMinTurns: 5, participantSummaryEmail: true },
    });
  });

  it("refuses to change the provider, owner or subject, but tolerates sending them back unchanged", async () => {
    const study = await aStudy();

    expect(parsePatchStudy({ voiceProvider: "vapi" }, study)).toMatchObject({
      ok: false,
      kind: "conflict",
    });
    expect(parsePatchStudy({ ownerRef: "someone_else" }, study)).toMatchObject({
      ok: false,
      kind: "conflict",
    });
    expect(parsePatchStudy({ subjectName: "Other Person" }, study)).toMatchObject({
      ok: false,
      kind: "conflict",
    });
    expect(
      parsePatchStudy(
        { voiceProvider: "elevenlabs", ownerRef: "pfa_user_123", subjectName: "Jae Kim" },
        study,
      ),
    ).toEqual({ ok: true, value: {} });
  });

  it("merges timing with the current values and rechecks the pair", async () => {
    const study = await aStudy();

    expect(parsePatchStudy({ timing: { hardStopMinutes: 12 } }, study)).toEqual({
      ok: true,
      value: { targetMinutes: 5, hardStopMinutes: 12 },
    });
    expect(parsePatchStudy({ timing: { targetMinutes: 9 } }, study)).toMatchObject({
      ok: false,
      kind: "invalid",
    });
  });

  it("changes landing text field by field, and null puts a field back to the standard", async () => {
    const study = {
      ...(await aStudy()),
      participantCopy: { intro: { tagline: "Old tagline", brandLabel: "PFA" } },
    };

    const result = parsePatchStudy(
      { landingCopy: { tagline: null, consentNote: "New consent" } },
      study,
    );

    expect(result).toEqual({
      ok: true,
      value: { participantCopy: { intro: { brandLabel: "PFA", consentNote: "New consent" } } },
    });
    expect(parsePatchStudy({ landingCopy: null }, study)).toEqual({
      ok: true,
      value: { participantCopy: null },
    });
  });

  it("clears the opening line and closing question with null, and rejects unknown fields", async () => {
    const study = await aStudy();

    expect(parsePatchStudy({ firstMessage: null, closingQuestion: null }, study)).toEqual({
      ok: true,
      value: { firstMessage: null, closingQuestion: null },
    });
    expect(parsePatchStudy({ colour: "red" }, study)).toMatchObject({ ok: false, kind: "invalid" });
  });
});

describe("parseInvitation", () => {
  const trackingId = "k3Zq9vX1mT8wRb4Yp7NcHd";

  it("accepts a random 22-character id with a name and context", () => {
    const result = parseInvitation({
      trackingId,
      colleagueFirstName: "Priya",
      context: { workContext: "We worked on billing.", team: "Payments" },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        trackingId,
        colleagueFirstName: "Priya",
        context: { workContext: "We worked on billing.", team: "Payments" },
      },
    });
  });

  it("treats context as optional", () => {
    expect(parseInvitation({ trackingId, colleagueFirstName: "Priya" })).toMatchObject({
      ok: true,
      value: { context: {} },
    });
  });

  it.each([
    ["too short (sequential-looking)", "pfa_req_456"],
    ["21 characters", "a".repeat(21)],
    ["129 characters", "a".repeat(129)],
    ["characters outside the allowed set", `${"a".repeat(21)}!`],
    ["spaces", `${"a".repeat(10)} ${"a".repeat(12)}`],
    ["missing", undefined],
    ["not text", 12345678901234567890123],
  ])("rejects a tracking id that is %s as invalid_tracking_id", (_label, id) => {
    expect(parseInvitation({ trackingId: id, colleagueFirstName: "Priya" })).toMatchObject({
      ok: false,
      kind: "invalid_tracking_id",
    });
  });

  it("accepts the longest and shortest allowed ids and the URL-safe symbols", () => {
    expect(parseInvitation({ trackingId: "a".repeat(22), colleagueFirstName: "P" }).ok).toBe(true);
    expect(parseInvitation({ trackingId: "a".repeat(128), colleagueFirstName: "P" }).ok).toBe(true);
    expect(parseInvitation({ trackingId: `-_${"a".repeat(20)}`, colleagueFirstName: "P" }).ok).toBe(
      true,
    );
  });

  it.each([
    ["a missing name", { trackingId }],
    ["a blank name", { trackingId, colleagueFirstName: " " }],
    ["a context that is not an object", { trackingId, colleagueFirstName: "P", context: "x" }],
    [
      "a context value that is not text",
      { trackingId, colleagueFirstName: "P", context: { a: 1 } },
    ],
    ["a bad context field name", { trackingId, colleagueFirstName: "P", context: { "a b": "x" } }],
    ["an unknown field", { trackingId, colleagueFirstName: "P", extra: 1 }],
  ])("rejects %s as invalid", (_label, body) => {
    expect(parseInvitation(body)).toMatchObject({ ok: false, kind: "invalid" });
  });

  it("rejects too many context fields", () => {
    const context = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, "v"]));

    expect(parseInvitation({ trackingId, colleagueFirstName: "P", context })).toMatchObject({
      ok: false,
      kind: "invalid",
    });
  });
});
