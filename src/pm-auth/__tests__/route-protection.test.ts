import { describe, expect, it } from "vitest";
import { requiresAuth } from "../route-protection";

describe("requiresAuth", () => {
  it("requires auth for dashboard pages", () => {
    expect(requiresAuth("/dashboard")).toBe(true);
    expect(requiresAuth("/dashboard/studies/123")).toBe(true);
  });

  it("requires auth for PM study API routes", () => {
    expect(requiresAuth("/api/studies")).toBe(true);
    expect(requiresAuth("/api/studies/abc-123")).toBe(true);
    expect(requiresAuth("/api/studies/abc-123/close")).toBe(true);
    expect(requiresAuth("/api/studies/abc-123/report")).toBe(true);
  });

  it("does not require auth for the participant intake endpoint", () => {
    expect(requiresAuth("/api/studies/some-link-token/interviews")).toBe(false);
  });

  it("does not require auth for Vapi webhook routes", () => {
    expect(requiresAuth("/api/vapi/webhook")).toBe(false);
    expect(requiresAuth("/api/vapi/chat/completions")).toBe(false);
  });

  it("does not require auth for public pages", () => {
    expect(requiresAuth("/")).toBe(false);
    expect(requiresAuth("/login")).toBe(false);
    expect(requiresAuth("/forgot-password")).toBe(false);
    expect(requiresAuth("/reset-password")).toBe(false);
  });
});
