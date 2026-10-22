import { describe, expect, it } from "vitest";
import { redactIdentity } from "../redact-identity";

describe("redactIdentity", () => {
  it("replaces a first name regardless of case, as a whole word", () => {
    expect(redactIdentity("Hi PRIYA, hello priya. Priyanka is someone else.", ["Priya"])).toBe(
      "Hi [Participant], hello [Participant]. Priyanka is someone else.",
    );
  });

  it("replaces email addresses even when no name is given", () => {
    expect(redactIdentity("write to a.b@corp.test today", [])).toBe(
      "write to [redacted email] today",
    );
  });

  it("replaces every listed name", () => {
    expect(redactIdentity("Dana and Marcus agreed", ["Dana", "Marcus"])).toBe(
      "[Participant] and [Participant] agreed",
    );
  });

  it("redacts the longest name first so a shorter one cannot fragment it", () => {
    expect(redactIdentity("Anna-Marie left; Anna stayed", ["Anna", "Anna-Marie"])).toBe(
      "[Participant] left; [Participant] stayed",
    );
  });

  it("treats a name with regex characters literally", () => {
    expect(redactIdentity("Hi J.R. and JxR", ["J.R."])).toBe("Hi [Participant] and JxR");
  });

  it("redacts names with accents, which a plain word boundary would miss", () => {
    expect(redactIdentity("Thanks José, and thanks JOSÉ. Josephine too.", ["José"])).toBe(
      "Thanks [Participant], and thanks [Participant]. Josephine too.",
    );
  });

  it("redacts an email whose local part holds the name as one email", () => {
    expect(redactIdentity("mail priya.raman@acme.test now", ["Priya"])).toBe(
      "mail [redacted email] now",
    );
  });

  it("ignores blank names and leaves other text alone", () => {
    expect(redactIdentity("Nothing to hide here", ["", "  "])).toBe("Nothing to hide here");
  });
});
