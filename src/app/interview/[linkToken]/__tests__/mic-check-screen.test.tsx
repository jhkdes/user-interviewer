// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rmsLevel, SILENCE_TIMEOUT_MS } from "../mic-level";
import { MicCheckScreen } from "../mic-check-screen";

/** What the fake microphone currently picks up: 128 is silence, further away is louder. */
let sampleValue = 128;
const stopTrack = vi.fn();
const getUserMedia = vi.fn();

class FakeAudioContext {
  createAnalyser() {
    return {
      fftSize: 0,
      getByteTimeDomainData: (samples: Uint8Array) => samples.fill(sampleValue),
    };
  }
  createMediaStreamSource() {
    return { connect: () => {} };
  }
  close() {
    return Promise.resolve();
  }
}

function grantMicrophone() {
  getUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: stopTrack }],
    getAudioTracks: () => [{ label: "Desk Microphone" }],
  });
}

function rejectMicrophone(name: string) {
  getUserMedia.mockRejectedValue(Object.assign(new Error(name), { name }));
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  sampleValue = 128;
  stopTrack.mockReset();
  getUserMedia.mockReset();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("rmsLevel", () => {
  it("is 0 for silence and grows with loudness", () => {
    expect(rmsLevel(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(rmsLevel(new Uint8Array([128, 128, 192, 64]))).toBeCloseTo(0.354, 2);
    expect(rmsLevel(new Uint8Array([]))).toBe(0);
  });
});

describe("the microphone check", () => {
  it("lets the participant continue once it hears them, and frees the microphone first", async () => {
    grantMicrophone();
    const onContinue = vi.fn();
    render(<MicCheckScreen onContinue={onContinue} />);
    await tick(0);
    expect(screen.getByText("Using: Desk Microphone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start the conversation" })).toBeNull();

    sampleValue = 190;
    await tick(500);

    expect(screen.getByText(/We can hear you/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start the conversation" }));
    expect(stopTrack).toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("says it cannot hear them when nothing is picked up, and offers to try again or go on", async () => {
    grantMicrophone();
    const onContinue = vi.fn();
    render(<MicCheckScreen onContinue={onContinue} />);
    await tick(SILENCE_TIMEOUT_MS + 200);

    expect(screen.getByText(/We can.t hear you yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start the conversation" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Start anyway" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("turns green if they speak after the warning", async () => {
    grantMicrophone();
    render(<MicCheckScreen onContinue={() => {}} />);
    await tick(SILENCE_TIMEOUT_MS + 200);
    expect(screen.getByText(/We can.t hear you yet/)).toBeInTheDocument();

    sampleValue = 200;
    await tick(500);

    expect(screen.getByRole("button", { name: "Start the conversation" })).toBeInTheDocument();
  });

  it("explains a blocked microphone and does not let them continue", async () => {
    rejectMicrophone("NotAllowedError");
    const onContinue = vi.fn();
    render(<MicCheckScreen onContinue={onContinue} />);
    await tick(0);

    expect(screen.getByRole("alert")).toHaveTextContent(/blocking the microphone/);
    expect(screen.queryByRole("button", { name: "Start anyway" })).toBeNull();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("says when no microphone is found, and tries again on request", async () => {
    rejectMicrophone("NotFoundError");
    render(<MicCheckScreen onContinue={() => {}} />);
    await tick(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn.t find a microphone/);

    grantMicrophone();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await tick(0);

    expect(screen.getByText("Using: Desk Microphone")).toBeInTheDocument();
  });

  it("goes straight on when the browser has no microphone API to test", () => {
    Reflect.deleteProperty(navigator, "mediaDevices");
    const onContinue = vi.fn();
    render(<MicCheckScreen onContinue={onContinue} />);

    expect(onContinue).toHaveBeenCalled();
  });
});
