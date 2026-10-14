// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudyLink } from "../study-link";

afterEach(cleanup);

describe("StudyLink", () => {
  it("shows the participant URL for the token", async () => {
    render(<StudyLink linkToken="abc123" />);

    expect(
      await screen.findByText(`${window.location.origin}/interview/abc123`),
    ).toBeInTheDocument();
    expect(screen.queryByText("Voice interview link")).not.toBeInTheDocument();
  });

  it("labels each link when a study has two, and copies the right one", async () => {
    render(
      <>
        <StudyLink linkToken="voice-token" label="Voice interview link" />
        <StudyLink linkToken="text-token" label="Text interview link" />
      </>,
    );

    expect(await screen.findByText("Voice interview link")).toBeInTheDocument();
    expect(screen.getByText("Text interview link")).toBeInTheDocument();
    expect(screen.getByText(/\/interview\/voice-token$/)).toBeInTheDocument();
    expect(screen.getByText(/\/interview\/text-token$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy text interview link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy voice interview link" })).toBeInTheDocument();
  });
});
