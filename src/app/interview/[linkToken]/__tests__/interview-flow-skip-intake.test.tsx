// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InterviewFlow } from "../interview-flow";
import { jsonResponse } from "./text-test-utils";

// The form, mic check, call and chat have their own tests; here they are
// stand-ins so these tests are about which screen follows the intro.
vi.mock("../intake-form", () => ({ IntakeForm: () => <p>A little about you</p> }));
vi.mock("../mic-check-screen", () => ({ MicCheckScreen: () => <p>Mic check</p> }));
vi.mock("../live-call", () => ({ LiveCall: () => <p>Voice call</p> }));
vi.mock("../text-chat", async (importOriginal) => {
  const original = await importOriginal<typeof import("../text-chat")>();
  return { ...original, TextChat: () => <p>Typed chat</p> };
});

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const study = {
  type: "feedback" as const,
  title: "Feedback for Jae Kim",
  description: "Jae Kim",
  questions: [],
  trackingId: "k3Zq9vX1mT8wRb4Yp7NcHd",
};

const created = { id: "interview-1", firstName: "Priya", voiceProvider: "elevenlabs" };

beforeEach(() => {
  vi.stubGlobal("navigator", { ...navigator, userAgent: DESKTOP_UA });
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  cleanup();
});

const startButton = () => screen.findByRole("button", { name: "Start" });

describe("InterviewFlow with the intake form skipped", () => {
  it("goes from the intro and consent screen to the mic check, creating the interview from the tracking id alone", async () => {
    const fetchSpy = vi.fn(async () => jsonResponse(created, 201));
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<InterviewFlow linkToken="voice-token" skipIntake {...study} />);

    await user.click(await startButton());

    expect(await screen.findByText("Mic check")).toBeInTheDocument();
    expect(screen.queryByText("A little about you")).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/studies/voice-token/interviews");
    expect(JSON.parse(String(init.body))).toMatchObject({
      consentGiven: true,
      trackingId: study.trackingId,
    });
  });

  it("goes straight into the typed chat on the text link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/text-state") ? jsonResponse({}, 404) : jsonResponse(created, 201),
      ),
    );
    const user = userEvent.setup();
    render(
      <InterviewFlow linkToken="text-token" channel="text" textModeEnabled skipIntake {...study} />,
    );

    await user.click(await startButton());

    expect(await screen.findByText("Typed chat")).toBeInTheDocument();
    expect(screen.queryByText("A little about you")).not.toBeInTheDocument();
  });

  it("says so and lets the colleague try again when the interview could not be created", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "down" }, 500))
      .mockResolvedValueOnce(jsonResponse(created, 201));
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<InterviewFlow linkToken="voice-token" skipIntake {...study} />);

    await user.click(await startButton());
    expect(await screen.findByText(/couldn't start your interview/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Mic check")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("shows the form as before when the setting is off", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const user = userEvent.setup();
    render(<InterviewFlow linkToken="voice-token" {...study} />);

    await user.click(await startButton());

    expect(await screen.findByText("A little about you")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
