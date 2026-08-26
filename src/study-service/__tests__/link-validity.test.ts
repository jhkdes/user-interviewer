import { describe, expect, it } from "vitest";
import type { Study } from "@/domain";
import { checkLinkValidity } from "../link-validity";

const baseStudy: Study = {
  id: "study-1",
  targetProfile: {
    industry: "Fintech",
    yearsOfExperience: "5-10 years",
    jobTitle: "Product Manager",
    seniority: "Senior",
    responsibility: "Owns the payments roadmap",
  },
  researchTopic: null,
  customPrompt: null,
  linkToken: "token",
  status: "open",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  closedAt: null,
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
});
