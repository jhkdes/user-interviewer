import { describe, expect, it } from "vitest";
import { isSubstantiveSummary } from "../is-substantive-summary";

describe("isSubstantiveSummary", () => {
  it("is false when painPoints, notableQuotes, and takeaways are all empty", () => {
    expect(isSubstantiveSummary({ painPoints: [], notableQuotes: [], takeaways: [] })).toBe(false);
  });

  it("is true when any one of the three arrays has content", () => {
    expect(isSubstantiveSummary({ painPoints: ["p"], notableQuotes: [], takeaways: [] })).toBe(
      true,
    );
    expect(isSubstantiveSummary({ painPoints: [], notableQuotes: ["q"], takeaways: [] })).toBe(
      true,
    );
    expect(isSubstantiveSummary({ painPoints: [], notableQuotes: [], takeaways: ["t"] })).toBe(
      true,
    );
  });
});
