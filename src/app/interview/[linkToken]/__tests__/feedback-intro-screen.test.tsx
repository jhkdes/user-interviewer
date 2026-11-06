// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FeedbackIntroScreen } from "../feedback-intro-screen";

afterEach(cleanup);

const base = { title: "Feedback on the session", description: "the webinar", onAgree: () => {} };

describe("FeedbackIntroScreen", () => {
  it("shows exactly the standard feedback wording when the study has no copy", () => {
    render(<FeedbackIntroScreen {...base} />);

    expect(screen.getByText(/discoverFirst\.co · quick feedback/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "A quick, ~5-minute voice check-in about the webinar — a few questions, then you're done.",
      ),
    ).toBeInTheDocument();
    for (const fact of ["~5 minutes", "Voice, not text", "No login"]) {
      expect(screen.getByText(fact)).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByText(/^The call is recorded \(audio and transcript\)/)).toBeInTheDocument();
    expect(screen.queryByText("How it works")).not.toBeInTheDocument();
    expect(screen.queryByText(/Read the FAQ/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("never offers typing on the voice link", () => {
    render(<FeedbackIntroScreen {...base} channel="voice" />);

    expect(screen.queryByText(/typing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/type if you prefer/i)).not.toBeInTheDocument();
  });

  it("uses written-chat wording, with no call or recording, on the text link", () => {
    render(<FeedbackIntroScreen {...base} channel="text" />);

    expect(
      screen.getByText(
        "A quick, ~5-minute written check-in about the webinar — a few questions, then you're done.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Typed chat, not voice")).toBeInTheDocument();
    expect(screen.getByText(/^No audio is recorded\./)).toBeInTheDocument();
    expect(screen.queryByText(/call is recorded/)).not.toBeInTheDocument();
  });

  it("shows the study's own wording, steps and contact line", () => {
    render(
      <FeedbackIntroScreen
        {...base}
        channel="text"
        copy={{
          intro: {
            brandLabel: "PFA · session feedback",
            tagline: "Priya asked for your honest view.",
            facts: ["5 minutes"],
            steps: [{ title: "Talk", body: "Answer a few questions." }],
            consentNote: "Starting means you agree to be recorded.",
            contactEmail: "help@pfa.example",
          },
        }}
      />,
    );

    expect(screen.getByText("PFA · session feedback")).toBeInTheDocument();
    expect(screen.getByText("Priya asked for your honest view.")).toBeInTheDocument();
    expect(screen.getByText("5 minutes")).toBeInTheDocument();
    expect(screen.queryByText("~5 minutes")).not.toBeInTheDocument();
    expect(screen.getByText("How it works")).toBeInTheDocument();
    expect(screen.getByText("Answer a few questions.")).toBeInTheDocument();
    expect(screen.getByText("Starting means you agree to be recorded.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "help@pfa.example" })).toHaveAttribute(
      "href",
      "mailto:help@pfa.example",
    );
    expect(screen.queryByText("Read the FAQ")).not.toBeInTheDocument();
  });

  it("links the FAQ only when the study turns it on", () => {
    render(<FeedbackIntroScreen {...base} copy={{ intro: { showFaq: true } }} />);

    expect(screen.getByRole("link", { name: "Read the FAQ" })).toHaveAttribute(
      "href",
      "/interview/faq",
    );
  });
});
