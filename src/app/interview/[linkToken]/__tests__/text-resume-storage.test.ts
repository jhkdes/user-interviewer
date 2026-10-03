// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSavedInterviewId,
  loadSavedInterviewId,
  saveInterviewId,
} from "../text-resume-storage";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("text resume storage", () => {
  it("saves and loads the interview id per link token", () => {
    saveInterviewId("token-a", "interview-1");
    saveInterviewId("token-b", "interview-2");

    expect(loadSavedInterviewId("token-a")).toBe("interview-1");
    expect(loadSavedInterviewId("token-b")).toBe("interview-2");
  });

  it("stores under an interview:<linkToken> key", () => {
    saveInterviewId("token-a", "interview-1");

    expect(JSON.parse(window.localStorage.getItem("interview:token-a") ?? "")).toEqual({
      interviewId: "interview-1",
    });
  });

  it("returns null when nothing is saved", () => {
    expect(loadSavedInterviewId("token-a")).toBeNull();
  });

  it("clears only that link token's saved id", () => {
    saveInterviewId("token-a", "interview-1");
    saveInterviewId("token-b", "interview-2");

    clearSavedInterviewId("token-a");

    expect(loadSavedInterviewId("token-a")).toBeNull();
    expect(loadSavedInterviewId("token-b")).toBe("interview-2");
  });

  it("ignores corrupt or unexpected stored values", () => {
    window.localStorage.setItem("interview:token-a", "not json");
    expect(loadSavedInterviewId("token-a")).toBeNull();

    window.localStorage.setItem("interview:token-a", JSON.stringify({ interviewId: 42 }));
    expect(loadSavedInterviewId("token-a")).toBeNull();

    window.localStorage.setItem("interview:token-a", JSON.stringify("just a string"));
    expect(loadSavedInterviewId("token-a")).toBeNull();
  });

  it("does not throw when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => saveInterviewId("token-a", "interview-1")).not.toThrow();
    expect(loadSavedInterviewId("token-a")).toBeNull();
    expect(() => clearSavedInterviewId("token-a")).not.toThrow();
  });
});
