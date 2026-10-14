// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Interview } from "@/domain";
import { DISCOVERY_TEXT_HARD_CAP_MS } from "@/interview-agent/termination";
import { InterviewFlow } from "../interview-flow";
import { jsonResponse, makeState, stateMessages } from "./text-test-utils";

// The intake form, the voice call, and the chat have their own tests; here
// they are stand-ins so these tests are about which screen the flow shows.
vi.mock("../intake-form", () => ({
  IntakeForm: ({ onStarted }: { onStarted: (interview: Interview) => void }) => (
    <button
      onClick={() =>
        onStarted({
          id: "interview-1",
          firstName: "Sam",
          voiceProvider: "vapi",
          mode: "text",
        } as Interview)
      }
    >
      Submit intake
    </button>
  ),
}));
vi.mock("../live-call", () => ({
  LiveCall: () => <p>Voice call</p>,
}));
vi.mock("../text-chat", async (importOriginal) => {
  const original = await importOriginal<typeof import("../text-chat")>();
  return {
    ...original,
    TextChat: ({
      interviewId,
      initialMessages,
      initialClock,
      heading,
      sessionLimitMs,
      onEnded,
    }: {
      interviewId: string;
      initialMessages: { text: string }[];
      initialClock: { startedAtMs: number } | null;
      heading?: string;
      sessionLimitMs?: number;
      onEnded: (reason: string | null) => void;
    }) => (
      <div>
        <p>
          Chat {interviewId} with {initialMessages.length} saved messages
        </p>
        <p>Heading: {heading ?? "(default)"}</p>
        <p>Limit: {sessionLimitMs ?? "none"}</p>
        <p>Clock: {initialClock ? "known" : "unknown"}</p>
        <button onClick={() => onEnded("text-interview-ended")}>Finish chat</button>
        <button onClick={() => onEnded("time-cap")}>Cap chat</button>
        <button onClick={() => onEnded("participant-inactive")}>Time out chat</button>
      </div>
    ),
  };
});

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const study = {
  type: "discovery" as const,
  title: "AI in a PM's day",
  description: "how product managers use AI",
  questions: [],
  textModeEnabled: true,
};

const SAVED_KEY = "interview:text-token";

beforeEach(() => {
  vi.stubGlobal("navigator", { ...navigator, userAgent: DESKTOP_UA });
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  cleanup();
});

function stubTextState(respond: () => Response) {
  const fetchSpy = vi.fn(async (url: string) => {
    if (url.includes("/text-state")) return respond();
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("InterviewFlow on a discovery study's text link", () => {
  it("shows the written-chat landing page with the time limit, not the voice wording", async () => {
    render(<InterviewFlow linkToken="text-token" channel="text" {...study} />);

    expect(await screen.findByText("Typed chat, not voice")).toBeInTheDocument();
    expect(screen.getByText(/ends automatically after 60 minutes/)).toBeInTheDocument();
    expect(screen.getByText(/No audio is recorded/)).toBeInTheDocument();
    expect(screen.queryByText("Voice, not text")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /FAQ/ })).not.toBeInTheDocument();
  });

  it("goes straight from intake into the chat: no mode screen, no voice call, no start-text call", async () => {
    const fetchSpy = stubTextState(() => jsonResponse({}, 404));
    const user = userEvent.setup();
    render(<InterviewFlow linkToken="text-token" channel="text" {...study} />);

    await user.click(await screen.findByRole("button", { name: /start the interview/i }));
    await user.click(await screen.findByRole("button", { name: "Submit intake" }));

    expect(await screen.findByText("Chat interview-1 with 0 saved messages")).toBeInTheDocument();
    expect(screen.getByText("Heading: Interview chat")).toBeInTheDocument();
    expect(screen.getByText(`Limit: ${DISCOVERY_TEXT_HARD_CAP_MS}`)).toBeInTheDocument();
    expect(screen.getByText("Clock: unknown")).toBeInTheDocument();
    expect(screen.queryByText("Ready when you are")).not.toBeInTheDocument();
    expect(screen.queryByText("Voice call")).not.toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([url]) => String(url).includes("/start-text"))).toBe(false);
  });

  it("remembers the chat under the text link's token", async () => {
    stubTextState(() => jsonResponse({}, 404));
    const user = userEvent.setup();
    render(<InterviewFlow linkToken="text-token" channel="text" {...study} />);

    await user.click(await screen.findByRole("button", { name: /start the interview/i }));
    await user.click(await screen.findByRole("button", { name: "Submit intake" }));

    expect(JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "")).toEqual({
      interviewId: "interview-1",
    });
  });

  it("shows the thank-you screen with typed wording when the chat ends normally", async () => {
    stubTextState(() => jsonResponse({}, 404));
    const user = userEvent.setup();
    render(<InterviewFlow linkToken="text-token" channel="text" {...study} />);
    await user.click(await screen.findByRole("button", { name: /start the interview/i }));
    await user.click(await screen.findByRole("button", { name: "Submit intake" }));

    await user.click(await screen.findByRole("button", { name: "Finish chat" }));

    expect(await screen.findByText("Thank you, you're done!")).toBeInTheDocument();
    expect(screen.getByText(/chat with us/)).toBeInTheDocument();
    expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
  });

  it("shows the session-ended screen, with the study's ending text, when the chat reaches its time limit", async () => {
    stubTextState(() => jsonResponse({}, 404));
    const user = userEvent.setup();
    render(
      <InterviewFlow
        linkToken="text-token"
        channel="text"
        {...study}
        copy={{ completion: { message: "Your report arrives by email within a day." } }}
      />,
    );
    await user.click(await screen.findByRole("button", { name: /start the interview/i }));
    await user.click(await screen.findByRole("button", { name: "Submit intake" }));

    await user.click(await screen.findByRole("button", { name: "Cap chat" }));

    expect(await screen.findByText("This session has ended")).toBeInTheDocument();
    expect(screen.getByText(/60-minute limit/)).toBeInTheDocument();
    expect(screen.getByText("Your report arrives by email within a day.")).toBeInTheDocument();
    expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
  });

  describe("coming back to a saved chat", () => {
    beforeEach(() => {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify({ interviewId: "interview-9" }));
    });

    it("resumes an interview in progress, with its saved messages and its start time", async () => {
      const fetchSpy = stubTextState(() =>
        jsonResponse(
          makeState({ messages: stateMessages(["interviewer", "Hi Sam!"], ["participant", "Hi"]) }),
        ),
      );
      render(<InterviewFlow linkToken="text-token" channel="text" {...study} />);

      expect(await screen.findByText("Chat interview-9 with 2 saved messages")).toBeInTheDocument();
      expect(screen.getByText("Clock: known")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /start the interview/i }),
      ).not.toBeInTheDocument();
      expect(String(fetchSpy.mock.calls[0][0])).toContain("linkToken=text-token");
    });

    it("shows the session-ended screen for an interview that ran out of time while away", async () => {
      stubTextState(() =>
        jsonResponse(makeState({ status: "completed", endedReason: "time-cap" })),
      );
      render(<InterviewFlow linkToken="text-token" channel="text" {...study} />);

      expect(await screen.findByText("This session has ended")).toBeInTheDocument();
      expect(window.localStorage.getItem(SAVED_KEY)).toBeNull();
    });

    it("shows the thank-you screen for one that finished normally", async () => {
      stubTextState(() =>
        jsonResponse(makeState({ status: "completed", endedReason: "participant-requested" })),
      );
      render(<InterviewFlow linkToken="text-token" channel="text" {...study} />);

      expect(await screen.findByText("Thank you, you're done!")).toBeInTheDocument();
    });
  });

  it("blocks phones with a message about the written interview, not a voice call", async () => {
    vi.stubGlobal("navigator", { ...navigator, userAgent: MOBILE_UA });
    render(<InterviewFlow linkToken="text-token" channel="text" {...study} />);

    expect(await screen.findByText("Please open this link on a desktop")).toBeInTheDocument();
    expect(screen.getByText(/written interview/)).toBeInTheDocument();
    expect(screen.queryByText(/voice call/i)).not.toBeInTheDocument();
  });
});

describe("InterviewFlow on the voice link of the same kind of study", () => {
  it("is unchanged: voice landing page, voice call after the mic check, no chat", async () => {
    render(<InterviewFlow linkToken="voice-token" {...study} />);

    expect(await screen.findByText("Voice, not text")).toBeInTheDocument();
    expect(screen.queryByText(/ends automatically after/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /FAQ/ })).toBeInTheDocument();
  });
});
