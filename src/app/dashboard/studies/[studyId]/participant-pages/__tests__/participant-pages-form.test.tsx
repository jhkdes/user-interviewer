// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JOB_SEARCH_PARTICIPANT_COPY } from "@/job-search-study/participant-copy";
import { ParticipantPagesForm } from "../participant-pages-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const props = {
  studyId: "study-1",
  title: "How Job Seekers Get Interviews",
  description: "how you search",
  linkToken: "abc123",
};

function stubSave(ok = true, body: unknown = {}) {
  const fetchSpy = vi.fn().mockResolvedValue({ ok, json: async () => body });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

const savedBody = (fetchSpy: ReturnType<typeof vi.fn>) =>
  JSON.parse(fetchSpy.mock.calls[0][1].body);

describe("ParticipantPagesForm", () => {
  it("starts from the standard wording and previews both pages", () => {
    render(<ParticipantPagesForm {...props} initialCopy={null} />);

    expect(screen.getByLabelText("Sentence under the title")).toHaveValue(
      "A 15-minute AI-run interview about how you search.",
    );
    expect(
      within(screen.getByTestId("landing-preview")).getByText("Get something back"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("ending-preview")).getByText("Thank you, you're done!"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the live landing page/ })).toHaveAttribute(
      "href",
      "/interview/abc123",
    );
  });

  it("saves nothing but null when the text is left at the standard wording", async () => {
    const fetchSpy = stubSave();
    render(<ParticipantPagesForm {...props} initialCopy={null} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/studies/study-1/participant-copy");
    expect(fetchSpy.mock.calls[0][1].method).toBe("PUT");
    expect(savedBody(fetchSpy)).toEqual({ participantCopy: null });
    expect(await screen.findByText(/Saved/)).toBeInTheDocument();
  });

  it("updates the preview as you type and saves only what you changed", async () => {
    const fetchSpy = stubSave();
    render(<ParticipantPagesForm {...props} initialCopy={null} />);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "All set!" } });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Your report is coming." },
    });

    const ending = within(screen.getByTestId("ending-preview"));
    expect(ending.getByText("All set!")).toBeInTheDocument();
    expect(ending.getByText("Your report is coming.")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(savedBody(fetchSpy)).toEqual({
      participantCopy: { completion: { title: "All set!", message: "Your report is coming." } },
    });
  });

  it("fills in the job-search wording without saving until you click Save", async () => {
    const fetchSpy = stubSave();
    render(<ParticipantPagesForm {...props} initialCopy={null} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Use the job-search wording" }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(
      within(screen.getByTestId("landing-preview")).getByText("Get your free report"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(savedBody(fetchSpy).participantCopy).toEqual(JOB_SEARCH_PARTICIPANT_COPY);
  });

  it("resets to the standard wording", async () => {
    const fetchSpy = stubSave();
    render(<ParticipantPagesForm {...props} initialCopy={JOB_SEARCH_PARTICIPANT_COPY} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reset to the standard wording" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(savedBody(fetchSpy)).toEqual({ participantCopy: null });
  });

  it("adds and removes facts and steps", async () => {
    render(<ParticipantPagesForm {...props} initialCopy={null} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Remove step 4" }));
    expect(screen.queryByText("Get something back")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a fact" }));
    expect(screen.getByLabelText("Fact 5")).toBeInTheDocument();
  });

  it("shows the reasons when saving fails", async () => {
    stubSave(false, { error: "Invalid", fields: ["tagline is longer than 300 characters"] });
    render(<ParticipantPagesForm {...props} initialCopy={null} />);

    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "tagline is longer than 300 characters",
    );
  });
});
