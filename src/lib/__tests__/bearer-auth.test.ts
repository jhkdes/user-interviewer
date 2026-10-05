import { describe, expect, it } from "vitest";
import { hasValidBearerToken } from "../bearer-auth";

function requestWith(authorization?: string) {
  return new Request("http://localhost/x", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("hasValidBearerToken", () => {
  it("accepts exactly the right secret", () => {
    expect(hasValidBearerToken(requestWith("Bearer s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a missing header", () => {
    expect(hasValidBearerToken(requestWith(), "s3cret")).toBe(false);
  });

  it("rejects a wrong secret, including one that differs only in the last character", () => {
    expect(hasValidBearerToken(requestWith("Bearer wrong!"), "s3cret")).toBe(false);
    expect(hasValidBearerToken(requestWith("Bearer s3creT"), "s3cret")).toBe(false);
  });

  it("rejects the secret without the Bearer scheme, or with another scheme", () => {
    expect(hasValidBearerToken(requestWith("s3cret"), "s3cret")).toBe(false);
    expect(hasValidBearerToken(requestWith("Basic s3cret"), "s3cret")).toBe(false);
    expect(hasValidBearerToken(requestWith("bearer s3cret"), "s3cret")).toBe(false);
  });

  it("rejects a token that is a prefix or an extension of the secret", () => {
    expect(hasValidBearerToken(requestWith("Bearer s3cre"), "s3cret")).toBe(false);
    expect(hasValidBearerToken(requestWith("Bearer s3cretX"), "s3cret")).toBe(false);
  });

  it("never accepts anything when the secret is empty, not even an empty bearer token", () => {
    expect(hasValidBearerToken(requestWith("Bearer "), "")).toBe(false);
    expect(hasValidBearerToken(requestWith("Bearer"), "")).toBe(false);
    expect(hasValidBearerToken(requestWith(), "")).toBe(false);
  });

  it("handles secrets with accented characters (header values are limited to Latin-1)", () => {
    expect(hasValidBearerToken(requestWith("Bearer clé-secret"), "clé-secret")).toBe(true);
    expect(hasValidBearerToken(requestWith("Bearer cle-secret"), "clé-secret")).toBe(false);
  });
});
