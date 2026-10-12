// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JOB_SEARCH_PARTICIPANT_COPY } from "@/job-search-study/participant-copy";
import { CompletionScreen } from "../completion-screen";
import { IntroScreen } from "../intro-screen";

afterEach(cleanup);

const introProps = {
  title: "How Controllers Work",
  description: "keeping books clean",
  onAgree: () => {},
};

describe("IntroScreen", () => {
  it("shows the standard wording when the study has no custom copy", () => {
    render(<IntroScreen {...introProps} />);

    expect(
      screen.getByText("A 15-minute AI-run interview about keeping books clean."),
    ).toBeInTheDocument();
    for (const fact of ["~15 minutes", "Voice, not text", "No login", "Confidential"]) {
      expect(screen.getByText(fact)).toBeInTheDocument();
    }
    expect(screen.getByText("Get something back")).toBeInTheDocument();
    expect(screen.getByText(/Starting means you're okay with that/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start the interview" })).toBeInTheDocument();
  });

  it("shows the study's own wording, leading with the free report", () => {
    render(<IntroScreen {...introProps} copy={JOB_SEARCH_PARTICIPANT_COPY} />);

    expect(screen.getByText(/get a free personalized job search report/)).toBeInTheDocument();
    expect(screen.getByText("Free personalized report")).toBeInTheDocument();
    expect(screen.getByText("Get your free report")).toBeInTheDocument();
    expect(screen.getByText(/jkim@discoverfirst\.co\. Check your spam folder/)).toBeInTheDocument();
    expect(screen.queryByText("Get something back")).not.toBeInTheDocument();
    // The consent note was left at the default.
    expect(screen.getByText(/Starting means you're okay with that/)).toBeInTheDocument();
  });

  it("uses custom text for one part and the standard for the rest", () => {
    render(
      <IntroScreen {...introProps} copy={{ intro: { consentNote: "We record this call." } }} />,
    );

    expect(screen.getByText("We record this call.")).toBeInTheDocument();
    expect(screen.getByText("Talk with an AI")).toBeInTheDocument();
  });
});

describe("CompletionScreen", () => {
  it("shows the standard wording, with the voice or typing verb, when there is no custom copy", () => {
    const { rerender } = render(<CompletionScreen />);
    expect(screen.getByText("Thank you, you're done!")).toBeInTheDocument();
    expect(screen.getByText(/time to talk with us\. We'll follow up by email/)).toBeInTheDocument();

    rerender(<CompletionScreen mode="text" />);
    expect(screen.getByText(/time to chat with us/)).toBeInTheDocument();
  });

  it("tells job seekers about the report: when, from whom, the spam folder, and the completed-interview condition", () => {
    render(<CompletionScreen copy={JOB_SEARCH_PARTICIPANT_COPY} />);

    expect(screen.getByText("Thank you, you're done!")).toBeInTheDocument();
    const message = screen.getByText(/free personalized job search report will arrive/);
    expect(message).toHaveTextContent(/within a day, from jkim@discoverfirst\.co/);
    expect(message).toHaveTextContent(/check your spam folder/);
    expect(message).toHaveTextContent(/completed interview/);
  });
});
