// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IntakeForm } from "../intake-form";

const sampleValues = {
  firstName: "Jordan",
  email: "jordan@example.com",
};

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("First name"), sampleValues.firstName);
  await user.type(screen.getByLabelText("Email"), sampleValues.email);
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("IntakeForm", () => {
  it("shows validation errors and never calls the API when fields are empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<IntakeForm linkToken="token-1" deviceType="desktop" onStarted={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Start interview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("firstName is required");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a malformed email without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<IntakeForm linkToken="token-1" deviceType="desktop" onStarted={vi.fn()} />);
    await user.type(screen.getByLabelText("First name"), sampleValues.firstName);
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Start interview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "email is not a valid email address",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("submits with consentGiven: true and calls onStarted with the created interview", async () => {
    const createdInterview = {
      id: "interview-1",
      studyId: "study-1",
      firstName: sampleValues.firstName,
      email: sampleValues.email,
      roleDescription: null,
      status: "pending",
      consentGivenAt: new Date().toISOString(),
      transcript: null,
      recordingUrl: null,
      vapiCallId: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => createdInterview });
    vi.stubGlobal("fetch", fetchSpy);
    const onStarted = vi.fn();
    const user = userEvent.setup();

    render(<IntakeForm linkToken="my-token" deviceType="desktop" onStarted={onStarted} />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Start interview" }));

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(createdInterview));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/studies/my-token/interviews",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ...sampleValues, consentGiven: true, deviceType: "desktop" }),
      }),
    );
  });

  it("shows the server's error message when the API rejects the request", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Study link is closed", reason: "closed" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<IntakeForm linkToken="token-1" deviceType="desktop" onStarted={vi.fn()} />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Start interview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Study link is closed");
  });

  it("omits screenerAnswers entirely when none of the optional screener questions are answered", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<IntakeForm linkToken="my-token" deviceType="desktop" onStarted={vi.fn()} />);
    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "Start interview" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body).not.toHaveProperty("screenerAnswers");
  });

  it("includes only the screener questions that were answered, and formats an 'Other' answer as free text", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<IntakeForm linkToken="my-token" deviceType="desktop" onStarted={vi.fn()} />);
    await fillForm(user);
    await user.selectOptions(
      screen.getByLabelText("What's your current level?"),
      "Senior Product Manager",
    );
    await user.selectOptions(screen.getByLabelText("What industry is your company in?"), "Other");
    await user.type(screen.getAllByPlaceholderText("Please specify")[0], "Fractional PM");
    await user.click(screen.getByLabelText("ChatGPT"));
    await user.click(screen.getByLabelText("Claude"));
    await user.click(screen.getByRole("button", { name: "Start interview" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.screenerAnswers).toEqual({
      level: "Senior Product Manager",
      industry: "Other: Fractional PM",
      aiToolsUsed: ["ChatGPT", "Claude"],
    });
  });
});
