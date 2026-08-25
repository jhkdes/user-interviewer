import { describe, expect, it } from "vitest";
import { renderSummaryEmail } from "../render-summary-email";

describe("renderSummaryEmail", () => {
  it("includes a thank-you note, the participant's name, and pain points/quotes/takeaways", () => {
    const { subject, html } = renderSummaryEmail({
      firstName: "Jordan",
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
      painPoints: ["p"],
      notableQuotes: [],
      takeaways: [],
    });

    expect(html).toContain('href="https://discoverfirst.co"');
  });

  it("omits a section entirely when its list is empty, rather than rendering an empty list", () => {
    const { html } = renderSummaryEmail({
      firstName: "Jordan",
      painPoints: ["p"],
      notableQuotes: [],
      takeaways: [],
    });

    expect(html).not.toMatch(/In your words/i);
    expect(html).not.toMatch(/Takeaways/i);
  });

  it("escapes HTML in participant-derived content", () => {
    const { html } = renderSummaryEmail({
      firstName: "Jordan <script>",
      painPoints: ["<b>bold pain</b>"],
      notableQuotes: [],
      takeaways: [],
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>bold pain</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold pain&lt;/b&gt;");
  });
});
