import { describe, expect, it, vi } from "vitest";
import { getPlayableRecordingUrl } from "../playable-recording-url";

const voiceInterview = {
  id: "interview-1",
  mode: "voice" as const,
  voiceProvider: "vapi" as const,
  elevenLabsConversationId: null,
  vapiCallId: "call-1",
  recordingUrl: "https://stored.example/recording.mp3",
};

describe("getPlayableRecordingUrl", () => {
  it("fetches a fresh Vapi URL for a Vapi voice interview", async () => {
    const fetchFresh = vi.fn().mockResolvedValue("https://fresh.example/recording.mp3");

    expect(await getPlayableRecordingUrl(voiceInterview, fetchFresh)).toBe(
      "https://fresh.example/recording.mp3",
    );
    expect(fetchFresh).toHaveBeenCalledWith("call-1");
  });

  it("falls back to the stored URL when there is no Vapi call id", async () => {
    const fetchFresh = vi.fn();

    expect(await getPlayableRecordingUrl({ ...voiceInterview, vapiCallId: null }, fetchFresh)).toBe(
      "https://stored.example/recording.mp3",
    );
    expect(fetchFresh).not.toHaveBeenCalled();
  });

  it("points an ElevenLabs interview at the recording proxy route", async () => {
    const fetchFresh = vi.fn();

    expect(
      await getPlayableRecordingUrl(
        {
          ...voiceInterview,
          voiceProvider: "elevenlabs",
          elevenLabsConversationId: "conv-1",
          vapiCallId: null,
        },
        fetchFresh,
      ),
    ).toBe("/api/interviews/interview-1/recording");
    expect(fetchFresh).not.toHaveBeenCalled();
  });

  it("has nothing to play for an ElevenLabs interview without a conversation id", async () => {
    expect(
      await getPlayableRecordingUrl(
        { ...voiceInterview, voiceProvider: "elevenlabs", vapiCallId: null },
        vi.fn(),
      ),
    ).toBeNull();
  });

  describe("a typed interview", () => {
    const typed = {
      ...voiceInterview,
      mode: "text" as const,
      vapiCallId: null,
      recordingUrl: null,
    };

    it("has nothing to play and never calls a voice provider, whichever provider the study uses", async () => {
      const fetchFresh = vi.fn();

      expect(await getPlayableRecordingUrl(typed, fetchFresh)).toBeNull();
      expect(
        await getPlayableRecordingUrl({ ...typed, voiceProvider: "elevenlabs" }, fetchFresh),
      ).toBeNull();
      expect(fetchFresh).not.toHaveBeenCalled();
    });

    it("has nothing to play even if stale recording fields were somehow left on it", async () => {
      const fetchFresh = vi.fn();

      expect(
        await getPlayableRecordingUrl(
          {
            ...typed,
            vapiCallId: "call-1",
            recordingUrl: "https://stored.example/recording.mp3",
            elevenLabsConversationId: "conv-1",
          },
          fetchFresh,
        ),
      ).toBeNull();
      expect(fetchFresh).not.toHaveBeenCalled();
    });
  });
});
