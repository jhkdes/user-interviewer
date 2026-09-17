// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewStudyForm } from "../new-study-form";

const sampleDraftQuestions = [
  {
    id: "q1",
    label: "What's your current role?",
    type: "single",
    options: ["Controller", "Assistant Controller"],
  },
];

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Title"), "How Controllers Keep Financial Clean");
  await user.type(
    screen.getByLabelText(/Description/),
    "challenges in keeping financial statements clean and reconciled",
  );
}

async function advanceToQuestionsStep(
  user: ReturnType<typeof userEvent.setup>,
  fetchSpy: ReturnType<typeof vi.fn>,
) {
  fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => sampleDraftQuestions });
  await fillDetails(user);
  await user.click(screen.getByRole("button", { name: "Generate questions" }));
  await waitFor(() => expect(screen.getByText("Pre-interview questions")).toBeInTheDocument());
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("NewStudyForm", () => {
  it("shows a validation error and never calls the API when title/description are empty", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    await user.click(screen.getByRole("button", { name: "Generate questions" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "title and description are required",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("generates questions then creates the study, showing the generated link on success", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    await advanceToQuestionsStep(user, fetchSpy);

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "study-1",
        title: "How Controllers Keep Financial Clean",
        description: "challenges in keeping financial statements clean and reconciled",
        preInterviewQuestions: sampleDraftQuestions,
        linkToken: "abc123",
        status: "open",
        createdAt: new Date().toISOString(),
        closedAt: null,
      }),
    });
    await user.click(screen.getByRole("button", { name: "Create study" }));

    await waitFor(() => expect(screen.getByText("Study created")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/studies",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "How Controllers Keep Financial Clean",
          description: "challenges in keeping financial statements clean and reconciled",
          preInterviewQuestions: sampleDraftQuestions,
          voiceProvider: "vapi",
        }),
      }),
    );
  });

  it("includes the research topic in the request body when filled in", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => sampleDraftQuestions });
    await fillDetails(user);
    await user.type(
      screen.getByLabelText(/Research topic/),
      "How AI actually shows up in a PM's day",
    );
    await user.click(screen.getByRole("button", { name: "Generate questions" }));
    await waitFor(() => expect(screen.getByText("Pre-interview questions")).toBeInTheDocument());

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "study-1",
        researchTopic: "How AI actually shows up in a PM's day",
        linkToken: "abc123",
        status: "open",
        createdAt: new Date().toISOString(),
        closedAt: null,
      }),
    });
    await user.click(screen.getByRole("button", { name: "Create study" }));

    await waitFor(() => expect(screen.getByText("Study created")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/studies",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "How Controllers Keep Financial Clean",
          description: "challenges in keeping financial statements clean and reconciled",
          preInterviewQuestions: sampleDraftQuestions,
          researchTopic: "How AI actually shows up in a PM's day",
          voiceProvider: "vapi",
        }),
      }),
    );
  });

  it("includes the custom prompt in the request body when filled in", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => sampleDraftQuestions });
    await fillDetails(user);
    // fireEvent.change (not user.type) — userEvent.type parses `{`/`}` as
    // special-key syntax, which mangles literal `{{placeholder}}` text.
    fireEvent.change(screen.getByLabelText(/Custom interview prompt/), {
      target: { value: "You are a research interviewer for {{participant_name}}..." },
    });
    await user.click(screen.getByRole("button", { name: "Generate questions" }));
    await waitFor(() => expect(screen.getByText("Pre-interview questions")).toBeInTheDocument());

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "study-1",
        customPrompt: "You are a research interviewer for {{participant_name}}...",
        linkToken: "abc123",
        status: "open",
        createdAt: new Date().toISOString(),
        closedAt: null,
      }),
    });
    await user.click(screen.getByRole("button", { name: "Create study" }));

    await waitFor(() => expect(screen.getByText("Study created")).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "/api/studies",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "How Controllers Keep Financial Clean",
          description: "challenges in keeping financial statements clean and reconciled",
          preInterviewQuestions: sampleDraftQuestions,
          customPrompt: "You are a research interviewer for {{participant_name}}...",
          voiceProvider: "vapi",
        }),
      }),
    );
  });

  it("shows the server's field errors when the API rejects the request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();

    render(<NewStudyForm />);
    await advanceToQuestionsStep(user, fetchSpy);

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid study input", fields: ["title is required"] }),
    });
    await user.click(screen.getByRole("button", { name: "Create study" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("title is required");
  });
});
