import { describe, expect, it } from "vitest";
import { validateIntake } from "../intake-validation";

const validInput = {
  firstName: "Jordan",
  email: "jordan@example.com",
};

describe("validateIntake", () => {
  it("accepts fully populated, well-formed intake info", () => {
    expect(validateIntake(validInput)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a missing first name", () => {
    const result = validateIntake({ ...validInput, firstName: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["firstName is required"]);
  });

  it("rejects a missing email", () => {
    const result = validateIntake({ ...validInput, email: "" });
    expect(result.errors).toEqual(["email is required"]);
  });

  it("rejects a malformed email", () => {
    const result = validateIntake({ ...validInput, email: "not-an-email" });
    expect(result.errors).toEqual(["email is not a valid email address"]);
  });

  it("reports every invalid field at once", () => {
    const result = validateIntake({ firstName: "", email: "nope" });
    expect(result.errors).toEqual(["firstName is required", "email is not a valid email address"]);
  });
});
