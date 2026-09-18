import { describe, expect, it } from "vitest";
import { renderSummaryEmail } from "../render-summary-email";

const emptyFields = {
  painPoints: [],
  notableQuotes: [],
  takeaways: [],
  liked: [],
  disliked: [],
  suggestions: [],
};

describe("renderSummaryEmail", () => {
  it("includes a thank-you note, the participant's name, and pain points/quotes/takeaways for a discovery study", () => {
    const { subject, html } = renderSummaryEmail({
      firstName: "Jordan",
      type: "discovery",
      ...emptyFields,
      painPoints: ["Manual status reporting eats a full afternoon each week."],
      notableQuotes: ["I basically have a second job just making slides."],
      takeaways: ["Reporting tooling is a strong candidate for automation."],
    });

    expect(subject).toContain("Jordan");
    expect(html).toContain("Jordan");
    expect(html).toMatch(/research partner/i);
    expect(html).toContain("Manual status reporting eats a full afternoon each week.");
    expect(html).toContain("I basically have a second job just making slides.");
    expect(html).toContain("Reporting tooling is a strong candidate for automation.");
  });

  it("includes the discoverfirst.co subscribe CTA", () => {
    const { html } = renderSummaryEmail({
      firstName: "Jordan",
      type: "discovery",
      ...emptyFields,
      painPoints: ["p"],
    });

    expect(html).toContain('href="https://discoverfirst.co"');
  });

  it("omits a section entirely when its list is empty, rather than rendering an empty list", () => {
    const { html } = renderSummaryEmail({
      firstName: "Jordan",
      type: "discovery",
      ...emptyFields,
      painPoints: ["p"],
    });

    expect(html).not.toMatch(/In your words/i);
    expect(html).not.toMatch(/Takeaways/i);
  });

  it("escapes HTML in participant-derived content", () => {
    const { html } = renderSummaryEmail({
      firstName: "Jordan <script>",
      type: "discovery",
      ...emptyFields,
      painPoints: ["<b>bold pain</b>"],
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>bold pain</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold pain&lt;/b&gt;");
  });

  it("renders liked/disliked/suggestions sections for a feedback study, not the discovery sections", () => {
    const { html } = renderSummaryEmail({
      firstName: "Sam",
      type: "feedback",
      ...emptyFields,
      liked: ["The pacing was great."],
      disliked: ["Audio cut out once."],
      suggestions: ["Double-check the audio setup beforehand."],
    });

    expect(html).toContain("What you liked");
    expect(html).toContain("The pacing was great.");
    expect(html).toContain("What could be better");
    expect(html).toContain("Audio cut out once.");
    expect(html).toContain("Suggestions");
    expect(html).toContain("Double-check the audio setup beforehand.");
    expect(html).not.toMatch(/What stood out/i);
    expect(html).not.toMatch(/Takeaways/i);
  });
});
