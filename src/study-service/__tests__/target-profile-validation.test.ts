import { describe, expect, it } from "vitest";
import { validateTargetProfile } from "../target-profile-validation";

const validProfile = {
  industry: "Fintech",
  yearsOfExperience: "5-10 years",
  jobTitle: "Product Manager",
  seniority: "Senior",
  responsibility: "Owns the payments roadmap",
};

describe("validateTargetProfile", () => {
  it("accepts a fully populated profile", () => {
    expect(validateTargetProfile(validProfile)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a profile with a missing field", () => {
    const result = validateTargetProfile({ ...validProfile, industry: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["industry is required"]);
  });

  it("rejects a profile with a whitespace-only field", () => {
    const result = validateTargetProfile({ ...validProfile, jobTitle: "   " });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(["jobTitle is required"]);
  });

  it("reports every missing field at once", () => {
    const result = validateTargetProfile({
      ...validProfile,
      industry: "",
      seniority: "",
    });
    expect(result.errors).toEqual(["industry is required", "seniority is required"]);
  });
});
