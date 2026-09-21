// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RedactedTranscriptEditor } from "../redacted-transcript-editor";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const speakers = ["interviewer", "participant"] as const;
const initialTexts = ["Tell me about your day.", "It was Jae's day, honestly."];
const autoRedactedTexts = ["Tell me about your day.", "It was [Participant]'s day, honestly."];

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  refresh.mockClear();
  cleanup();
});

describe("RedactedTranscriptEditor", () => {
  it("renders each turn's speaker label and text", () => {
    render(
      <RedactedTranscriptEditor
        studyId="study-1"
        interviewId="interview-1"
        speakers={[...speakers]}
        initialTexts={initialTexts}
        autoRedactedTexts={autoRedactedTexts}
      />,
    );

    expect(screen.getByText("Interviewer")).toBeInTheDocument();
    expect(screen.getByText("Participant")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Tell me about your day.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("It was Jae's day, honestly.")).toBeInTheDocument();
  });

  it("resets to the auto-redacted text when 'Reset to auto-redacted' is clicked", async () => {
    const user = userEvent.setup();
    render(
      <RedactedTranscriptEditor
        studyId="study-1"
        interviewId="interview-1"
        speakers={[...speakers]}
        initialTexts={initialTexts}
        autoRedactedTexts={autoRedactedTexts}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reset to auto-redacted" }));

    expect(screen.getByDisplayValue("It was [Participant]'s day, honestly.")).toBeInTheDocument();
  });

  it("saves the edited texts and navigates to the export page on success", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(
      <RedactedTranscriptEditor
        studyId="study-1"
        interviewId="interview-1"
        speakers={[...speakers]}
        initialTexts={initialTexts}
        autoRedactedTexts={autoRedactedTexts}
      />,
    );

    const secondTurn = screen.getByDisplayValue("It was Jae's day, honestly.");
    await user.clear(secondTurn);
    await user.type(secondTurn, "It was fine.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/studies/study-1/interviews/interview-1/redacted-transcript",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ texts: ["Tell me about your day.", "It was fine."] }),
        }),
      ),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/dashboard/studies/study-1/interviews/interview-1/export"),
    );
  });

  it("shows the server's error message when saving fails", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "texts must be an array of 2 entries" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(
      <RedactedTranscriptEditor
        studyId="study-1"
        interviewId="interview-1"
        speakers={[...speakers]}
        initialTexts={initialTexts}
        autoRedactedTexts={autoRedactedTexts}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("texts must be an array of 2 entries")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
