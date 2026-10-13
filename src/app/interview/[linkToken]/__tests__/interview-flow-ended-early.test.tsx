// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Interview } from "@/domain";
import { InterviewFlow } from "../interview-flow";

const SUBMISSION = {
  firstName: "Sam",
  email: "sam@example.com",
  consentGiven: true,
  deviceType: "desktop",
  screenerAnswers: { search_status: "Actively searching for a new job" },
};

// The intake form and the call have their own tests; here they are stand-ins
// so these tests are about which screen the flow shows after the call ends.
vi.mock("../intake-form", () => ({
  IntakeForm: ({
    onStarted,
    onSubmitted,
  }: {
    onStarted: (interview: Interview) => void;
    onSubmitted?: (submission: unknown) => void;
  }) => (
    <button
      onClick={() => {
        onSubmitted?.(SUBMISSION);
        onStarted({
          id: "interview-1",
          firstName: "Sam",
          voiceProvider: "elevenlabs",
        } as Interview);
      }}
    >
      Submit intake
    </button>
  ),
}));
vi.mock("../live-call", () => ({
  LiveCall: ({
    interviewId,
    onEnded,
  }: {
    interviewId: string;
    onEnded: (info?: { participantTurns: number; reason: string }) => void;
  }) => (
    <div>
      <p>Voice call {interviewId}</p>
      <button onClick={() => onEnded({ participantTurns: 4, reason: "error" })}>Drop early</button>
      <button onClick={() => onEnded({ participantTurns: 1, reason: "user" })}>Leave early</button>
      <button onClick={() => onEnded({ participantTurns: 12, reason: "agent" })}>
        Finish call
      </button>
      <button onClick={() => onEnded()}>End without info</button>
    </div>
  ),
}));

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const study = {
  type: "discovery" as const,
  title: "How Job Seekers Get Interviews",
  description: "how you search",
  questions: [],
};

beforeEach(() => {
  vi.stubGlobal("navigator", { ...navigator, userAgent: DESKTOP_UA });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

async function startCall(
  user: ReturnType<typeof userEvent.setup>,
  extra: { minParticipantTurns?: number } = {},
) {
  render(<InterviewFlow linkToken="token-1" {...study} {...extra} />);
  await user.click(await screen.findByRole("button", { name: "Start the interview" }));
  await user.click(screen.getByRole("button", { name: "Submit intake" }));
  expect(await screen.findByText("Voice call interview-1")).toBeInTheDocument();
}

describe("a call that ends before there is a full conversation", () => {
  it("shows the ended-early screen instead of the thank-you, for a dropped call", async () => {
    const user = userEvent.setup();
    await startCall(user);

    await user.click(screen.getByRole("button", { name: "Drop early" }));

    expect(screen.getByText("Your call ended early")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start again" })).toBeInTheDocument();
    expect(screen.queryByText("Thank you, you're done!")).not.toBeInTheDocument();
  });

  it("shows it for a participant who left after only a turn or two as well", async () => {
    const user = userEvent.setup();
    await startCall(user);

    await user.click(screen.getByRole("button", { name: "Leave early" }));

    expect(screen.getByText("Your call ended early")).toBeInTheDocument();
  });

  it("starts a new interview from the details already given, without asking again", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "interview-2", firstName: "Sam", voiceProvider: "elevenlabs" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    await startCall(user);
    await user.click(screen.getByRole("button", { name: "Drop early" }));

    await user.click(screen.getByRole("button", { name: "Start again" }));

    expect(await screen.findByText("Voice call interview-2")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/studies/token-1/interviews");
    expect(fetchSpy.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual(SUBMISSION);
    expect(screen.queryByText("Your call ended early")).not.toBeInTheDocument();
  });

  it("says so and stays put when the new interview cannot be created", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const user = userEvent.setup();
    await startCall(user);
    await user.click(screen.getByRole("button", { name: "Drop early" }));

    await user.click(screen.getByRole("button", { name: "Start again" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't start a new interview/);
    expect(screen.getByText("Your call ended early")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Start again" })).toBeEnabled());
  });
});

describe("a study that makes a report", () => {
  it("accepts a call that reaches the report's minimum number of turns", async () => {
    const user = userEvent.setup();
    await startCall(user, { minParticipantTurns: 12 });

    await user.click(screen.getByRole("button", { name: "Finish call" }));

    expect(screen.getByText("Thank you, you're done!")).toBeInTheDocument();
  });

  it("shows the ended-early screen for a call that stops short of the minimum", async () => {
    const user = userEvent.setup();
    await startCall(user, { minParticipantTurns: 20 });

    // 12 turns is plenty for an ordinary study but not for a 20-turn minimum.
    await user.click(screen.getByRole("button", { name: "Finish call" }));

    expect(screen.getByText("Your call ended early")).toBeInTheDocument();
  });
});

describe("a call that ends normally", () => {
  it("shows the thank-you page when there was a full conversation", async () => {
    const user = userEvent.setup();
    await startCall(user);

    await user.click(screen.getByRole("button", { name: "Finish call" }));

    expect(screen.getByText("Thank you, you're done!")).toBeInTheDocument();
    expect(screen.queryByText("Your call ended early")).not.toBeInTheDocument();
  });

  it("shows the thank-you page when the call component reports nothing (the Vapi call)", async () => {
    const user = userEvent.setup();
    await startCall(user);

    await user.click(screen.getByRole("button", { name: "End without info" }));

    expect(screen.getByText("Thank you, you're done!")).toBeInTheDocument();
  });
});
