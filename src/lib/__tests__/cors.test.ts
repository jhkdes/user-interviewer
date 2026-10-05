import { describe, expect, it } from "vitest";
import { corsHeaders, parseAllowedOrigins } from "../cors";

const DEFAULTS = ["https://discoverfirst.co"];

describe("parseAllowedOrigins", () => {
  it("uses the defaults when the setting is unset, empty, or only separators", () => {
    expect(parseAllowedOrigins(undefined, DEFAULTS)).toEqual(DEFAULTS);
    expect(parseAllowedOrigins("", DEFAULTS)).toEqual(DEFAULTS);
    expect(parseAllowedOrigins("  , ,", DEFAULTS)).toEqual(DEFAULTS);
  });

  it("splits a comma-separated list and trims it", () => {
    expect(
      parseAllowedOrigins(" https://discoverfirst.co , https://www.discoverfirst.co ", DEFAULTS),
    ).toEqual(["https://discoverfirst.co", "https://www.discoverfirst.co"]);
  });

  it("replaces the defaults rather than adding to them", () => {
    expect(parseAllowedOrigins("https://example.com", DEFAULTS)).toEqual(["https://example.com"]);
  });

  it("drops a trailing slash, which an Origin header never has", () => {
    expect(parseAllowedOrigins("https://discoverfirst.co/", DEFAULTS)).toEqual([
      "https://discoverfirst.co",
    ]);
  });
});

describe("corsHeaders", () => {
  const allowed = ["https://discoverfirst.co", "https://www.discoverfirst.co"];

  it("allows exactly the requesting origin when it is listed", () => {
    expect(corsHeaders("https://discoverfirst.co", allowed)).toEqual({
      Vary: "Origin",
      "Access-Control-Allow-Origin": "https://discoverfirst.co",
    });
    expect(
      corsHeaders("https://www.discoverfirst.co", allowed)["Access-Control-Allow-Origin"],
    ).toBe("https://www.discoverfirst.co");
  });

  it("never answers with a wildcard", () => {
    expect(Object.values(corsHeaders("https://discoverfirst.co", allowed))).not.toContain("*");
  });

  it("grants nothing to an origin that isn't listed", () => {
    for (const origin of [
      "https://evil.example",
      "http://discoverfirst.co",
      "https://discoverfirst.co.evil.example",
      "https://sub.discoverfirst.co",
      "https://discoverfirst.co:8443",
      "null",
    ]) {
      expect(corsHeaders(origin, allowed)).toEqual({ Vary: "Origin" });
    }
  });

  it("grants nothing to a request without an Origin header", () => {
    expect(corsHeaders(null, allowed)).toEqual({ Vary: "Origin" });
  });

  it("always varies on Origin so a shared cache can't hand one site another's headers", () => {
    expect(corsHeaders(null, allowed).Vary).toBe("Origin");
    expect(corsHeaders("https://evil.example", allowed).Vary).toBe("Origin");
    expect(corsHeaders("https://discoverfirst.co", allowed).Vary).toBe("Origin");
  });
});
