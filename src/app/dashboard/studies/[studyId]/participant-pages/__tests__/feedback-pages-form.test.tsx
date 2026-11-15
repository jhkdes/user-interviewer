// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackPagesForm } from "../feedback-pages-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const props = {
  studyId: "study-1",
  title: "Feedback for Jae",
  description: "working with Jae",
  linkToken: "abc123",
  voiceProvider: "elevenlabs" as const,
  initialCopy: null,
  initialFirstMessage: null,
  initialClosingQuestion: null,
};

function stubSave() {
  const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

const bodyOf = (fetchSpy: ReturnType<typeof vi.fn>, path: string) => {
  const call = fetchSpy.mock.calls.find(([url]) => String(url).endsWith(path));
  return call ? JSON.parse(call[1].body) : undefined;
};

describe("FeedbackPagesForm", () => {
  it("starts from the standard feedback wording and previews both pages", () => {
    render(<FeedbackPagesForm {...props} />);

    expect(screen.getByLabelText("Label above the title")).toHaveValue(
      "discoverFirst.co · quick feedback",
    );
    expect(screen.getByLabelText("Sentence under the title")).toHaveValue(
      "A quick, ~5-minute voice check-in about working with Jae — a few questions, then you're done.",
    );
    expect(
      within(screen.getByTestId("landing-preview")).getByRole("button", { name: "Start" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("ending-preview")).getByText("Thank you, you're done!"),
    ).toBeInTheDocument();
  });

  it("saves nothing for the pages, and no lines, when everything is left at the standard", async () => {
    const fetchSpy = stubSave();
    render(<FeedbackPagesForm {...props} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(bodyOf(fetchSpy, "/participant-copy")).toEqual({
      participantCopy: null,
      channel: "voice",
    });
    expect(bodyOf(fetchSpy, "/interviewer-lines")).toEqual({
      firstMessage: null,
      closingQuestion: null,
    });
  });

  it("saves only what was changed, plus the two interviewer lines", async () => {
    const fetchSpy = stubSave();
    const user = userEvent.setup();
    render(<FeedbackPagesForm {...props} />);

    const label = screen.getByLabelText("Label above the title");
    await user.clear(label);
    await user.type(label, "PFA · session feedback");
    await user.type(screen.getByLabelText("Contact email (optional)"), "help@pfa.example");
    await user.click(screen.getByLabelText("Link to the discoverFirst FAQ"));
    await user.type(screen.getByLabelText("Opening line"), "Hi there");
    await user.type(screen.getByLabelText("Closing question"), "Anything to add?");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(bodyOf(fetchSpy, "/participant-copy")).toEqual({
      participantCopy: {
        intro: {
          brandLabel: "PFA · session feedback",
          contactEmail: "help@pfa.example",
          showFaq: true,
        },
      },
      channel: "voice",
    });
    expect(bodyOf(fetchSpy, "/interviewer-lines")).toEqual({
      firstMessage: "Hi there",
      closingQuestion: "Anything to add?",
    });
  });

  it("does not offer an opening line for a study that is not on ElevenLabs", async () => {
    const fetchSpy = stubSave();
    render(<FeedbackPagesForm {...props} voiceProvider="vapi" />);

    expect(screen.getByLabelText("Opening line")).toBeDisabled();
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(bodyOf(fetchSpy, "/interviewer-lines")).toEqual({ closingQuestion: null });
  });

  it("shows the server's error and no success message when a save is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "bad", fields: ["contact email must be an email address"] }),
      }),
    );
    render(<FeedbackPagesForm {...props} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "contact email must be an email address",
    );
    expect(screen.queryByText(/^Saved\./)).not.toBeInTheDocument();
  });

  describe("the text link", () => {
    it("starts from the text wording, follows the voice link's custom copy, and offers no opening line", () => {
      render(
        <FeedbackPagesForm
          {...props}
          channel="text"
          voiceCopy={{ intro: { brandLabel: "PFA · session feedback" } }}
        />,
      );

      expect(screen.getByLabelText("Label above the title")).toHaveValue("PFA · session feedback");
      expect(screen.getByLabelText("Sentence under the title")).toHaveValue(
        "A quick, ~5-minute written check-in about working with Jae — a few questions, then you're done.",
      );
      expect(screen.getByLabelText("Opening line")).toBeDisabled();
      expect(
        screen.getByRole("link", { name: /Open the live text landing page/ }),
      ).toBeInTheDocument();
    });

    it("saves for the text channel, only what differs from the voice link, and never sends an opening line", async () => {
      const fetchSpy = stubSave();
      const user = userEvent.setup();
      render(
        <FeedbackPagesForm
          {...props}
          channel="text"
          voiceCopy={{ intro: { brandLabel: "PFA · session feedback" } }}
        />,
      );

      const tagline = screen.getByLabelText("Sentence under the title");
      await user.clear(tagline);
      await user.type(tagline, "Typed hello");
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
      expect(bodyOf(fetchSpy, "/participant-copy")).toEqual({
        participantCopy: { intro: { tagline: "Typed hello" } },
        channel: "text",
      });
      expect(bodyOf(fetchSpy, "/interviewer-lines")).toEqual({ closingQuestion: null });
    });
  });
});
