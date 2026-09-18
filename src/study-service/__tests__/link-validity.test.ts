import { describe, expect, it } from "vitest";
import type { Study } from "@/domain";
import { checkLinkValidity, getLinkExpiryInfo } from "../link-validity";

const baseStudy: Study = {
  id: "study-1",
  title: "How AI Actually Shows Up in a PM's Day",
  description: "how product managers really use AI at work",
  preInterviewQuestions: [],
  researchTopic: null,
  customPrompt: null,
  linkToken: "token",
  status: "open",
  voiceProvider: "vapi",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  closedAt: null,
  linkExtendedAt: null,
};

describe("checkLinkValidity", () => {
  it("is valid for an open study within the expiry window", () => {
    const now = new Date("2026-08-03T00:00:00Z");
    expect(checkLinkValidity(baseStudy, now)).toBe("valid");
  });

  it("is closed for a manually closed study, even within the expiry window", () => {
    const closedStudy: Study = { ...baseStudy, status: "closed", closedAt: new Date() };
    const now = new Date("2026-08-03T00:00:00Z");
    expect(checkLinkValidity(closedStudy, now)).toBe("closed");
  });

  it("is expired exactly 7 days after creation", () => {
    const now = new Date("2026-08-08T00:00:00Z");
    expect(checkLinkValidity(baseStudy, now)).toBe("expired");
  });

  it("is valid just under the 7-day boundary", () => {
    const now = new Date("2026-08-07T23:59:59Z");
    expect(checkLinkValidity(baseStudy, now)).toBe("valid");
  });

  it("is expired well past the 7-day window", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    expect(checkLinkValidity(baseStudy, now)).toBe("expired");
  });

  it("is valid past the original 7-day window once the link was extended", () => {
    const extendedStudy: Study = {
      ...baseStudy,
      linkExtendedAt: new Date("2026-08-08T00:00:00Z"),
    };
    const now = new Date("2026-08-10T00:00:00Z");
    expect(checkLinkValidity(extendedStudy, now)).toBe("valid");
  });

  it("is expired 7 days after the extension, not the original creation", () => {
    const extendedStudy: Study = {
      ...baseStudy,
      linkExtendedAt: new Date("2026-08-08T00:00:00Z"),
    };
    const now = new Date("2026-08-15T00:00:00Z");
    expect(checkLinkValidity(extendedStudy, now)).toBe("expired");
  });
});

describe("getLinkExpiryInfo", () => {
  it("reports expiresAt 7 days after creation and daysRemaining counting down, not yet expiring soon", () => {
    const now = new Date("2026-08-03T00:00:00Z");
    const info = getLinkExpiryInfo(baseStudy, now);

    expect(info.validity).toBe("valid");
    expect(info.expiresAt).toEqual(new Date("2026-08-08T00:00:00Z"));
    expect(info.daysRemaining).toBe(5);
    expect(info.isExpiringSoon).toBe(false);
  });

  it("flags isExpiringSoon once within the warning window, while still valid", () => {
    const now = new Date("2026-08-06T12:00:00Z"); // 1.5 days before the 8/8 expiry
    const info = getLinkExpiryInfo(baseStudy, now);

    expect(info.validity).toBe("valid");
    expect(info.daysRemaining).toBe(2);
    expect(info.isExpiringSoon).toBe(true);
  });

  it("does not flag isExpiringSoon well before the warning window", () => {
    const now = new Date("2026-08-01T00:00:00Z"); // 7 days out
    const info = getLinkExpiryInfo(baseStudy, now);

    expect(info.isExpiringSoon).toBe(false);
  });

  it("reports daysRemaining as zero or negative once expired, and isExpiringSoon false", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const info = getLinkExpiryInfo(baseStudy, now);

    expect(info.validity).toBe("expired");
    expect(info.daysRemaining).toBeLessThanOrEqual(0);
    // Already expired isn't "expiring soon" — it's a distinct, more urgent state.
    expect(info.isExpiringSoon).toBe(false);
  });

  it("computes expiresAt/daysRemaining relative to the extension, not the original creation", () => {
    const extendedStudy: Study = {
      ...baseStudy,
      linkExtendedAt: new Date("2026-08-08T00:00:00Z"),
    };
    const now = new Date("2026-08-13T00:00:00Z");
    const info = getLinkExpiryInfo(extendedStudy, now);

    expect(info.expiresAt).toEqual(new Date("2026-08-15T00:00:00Z"));
    expect(info.daysRemaining).toBe(2);
    expect(info.isExpiringSoon).toBe(true);
  });

  it("reports null expiresAt/daysRemaining and isExpiringSoon: false for a closed study", () => {
    const closedStudy: Study = { ...baseStudy, status: "closed", closedAt: new Date() };
    const info = getLinkExpiryInfo(closedStudy, new Date("2026-08-03T00:00:00Z"));

    expect(info.validity).toBe("closed");
    expect(info.expiresAt).toBeNull();
    expect(info.daysRemaining).toBeNull();
    expect(info.isExpiringSoon).toBe(false);
  });
});
