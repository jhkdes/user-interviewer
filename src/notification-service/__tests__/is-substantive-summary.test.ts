import { describe, expect, it } from "vitest";
import { isSubstantiveSummary } from "../is-substantive-summary";

const empty = { painPoints: [], notableQuotes: [], takeaways: [], liked: [], disliked: [], suggestions: [] };

describe("isSubstantiveSummary", () => {
  it("is false when all six arrays are empty", () => {
    expect(isSubstantiveSummary(empty)).toBe(false);
  });

  it("is true when any one of the discovery-type arrays has content", () => {
    expect(isSubstantiveSummary({ ...empty, painPoints: ["p"] })).toBe(true);
    expect(isSubstantiveSummary({ ...empty, notableQuotes: ["q"] })).toBe(true);
    expect(isSubstantiveSummary({ ...empty, takeaways: ["t"] })).toBe(true);
  });

  it("is true when any one of the feedback-type arrays has content", () => {
    expect(isSubstantiveSummary({ ...empty, liked: ["l"] })).toBe(true);
    expect(isSubstantiveSummary({ ...empty, disliked: ["d"] })).toBe(true);
    expect(isSubstantiveSummary({ ...empty, suggestions: ["s"] })).toBe(true);
  });
});
