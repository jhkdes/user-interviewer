import { afterEach, describe, expect, it, vi } from "vitest";
import { isMobileDevice } from "../device";

function stubUserAgent(userAgent: string) {
  vi.stubGlobal("navigator", { userAgent });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isMobileDevice", () => {
  it("returns true for an iPhone Safari UA", () => {
    stubUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    expect(isMobileDevice()).toBe(true);
  });

  it("returns true for an Android Chrome UA", () => {
    stubUserAgent(
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    );
    expect(isMobileDevice()).toBe(true);
  });

  it("returns false for a desktop Chrome UA", () => {
    stubUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );
    expect(isMobileDevice()).toBe(false);
  });

  it("returns false for a desktop Safari UA", () => {
    stubUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    );
    expect(isMobileDevice()).toBe(false);
  });

  it("returns false for a desktop Firefox UA", () => {
    stubUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0");
    expect(isMobileDevice()).toBe(false);
  });
});
