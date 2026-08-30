// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewStudyForm } from "../new-study-form";

const sampleProfile = {
  industry: "Fintech",
  yearsOfExperience: "5-10 years",
  jobTitle: "Product Manager",
  seniority: "Senior",
  responsibility: "Owns the payments roadmap",
};

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Industry"), sampleProfile.industry);
  await user.type(screen.getByLabelText("Years of experience"), sampleProfile.yearsOfExperience);
  await user.type(screen.getByLabelText("Job title"), sampleProfile.jobTitle);
  await user.type(screen.getByLabelText("Seniority"), sampleProfile.seniority);
  await user.type(screen.getByLabelText("Overall responsibility"), sampleProfile.responsibility);
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("NewStudyForm", () => {
  it("shows validation errors and never calls the API when fields are empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    await user.click(screen.getByRole("button", { name: "Create study" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("industry is required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits the target profile and shows the generated link on success", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "study-1",
        targetProfile: sampleProfile,
        linkToken: "abc123",
        status: "open",
        createdAt: new Date().toISOString(),
        closedAt: null,
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create study" }));

    await waitFor(() => expect(screen.getByText("Study created")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/studies",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetProfile: sampleProfile, voiceProvider: "vapi" }),
      }),
    );
  });

  it("includes the research topic in the request body when filled in", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "study-1",
        targetProfile: sampleProfile,
        researchTopic: "How AI actually shows up in a PM's day",
        linkToken: "abc123",
        status: "open",
        createdAt: new Date().toISOString(),
        closedAt: null,
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    await fillForm(user);
    await user.type(
      screen.getByLabelText(/Research topic/),
      "How AI actually shows up in a PM's day",
    );
    await user.click(screen.getByRole("button", { name: "Create study" }));

    await waitFor(() => expect(screen.getByText("Study created")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/studies",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          targetProfile: sampleProfile,
          researchTopic: "How AI actually shows up in a PM's day",
          voiceProvider: "vapi",
        }),
      }),
    );
  });

  it("includes the custom prompt in the request body when filled in", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "study-1",
        targetProfile: sampleProfile,
        customPrompt: "You are a research interviewer for {{participant_name}}...",
        linkToken: "abc123",
        status: "open",
        createdAt: new Date().toISOString(),
        closedAt: null,
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    await fillForm(user);
    // fireEvent.change (not user.type) — userEvent.type parses `{`/`}` as
    // special-key syntax, which mangles literal `{{placeholder}}` text.
    fireEvent.change(screen.getByLabelText(/Custom interview prompt/), {
      target: { value: "You are a research interviewer for {{participant_name}}..." },
    });
    await user.click(screen.getByRole("button", { name: "Create study" }));

    await waitFor(() => expect(screen.getByText("Study created")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/studies",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          targetProfile: sampleProfile,
          customPrompt: "You are a research interviewer for {{participant_name}}...",
          voiceProvider: "vapi",
        }),
      }),
    );
  });

  it("shows the server's field errors when the API rejects the request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Invalid target profile", fields: ["industry is required"] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    // Bypass client-side validation by filling every field, then the fake
    // fetch still returns a 400 — proving the server-error path is handled
    // independently of the client-side pre-validation.
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Create study" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("industry is required");
  });
});
