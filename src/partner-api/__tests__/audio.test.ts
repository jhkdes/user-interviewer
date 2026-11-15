import { afterEach, describe, expect, it } from "vitest";
import {
  audioResponse,
  cachedAudio,
  clearAudioCache,
  forgetAudio,
  parseRange,
  rememberAudio,
} from "../audio";

afterEach(() => clearAudioCache());

describe("parseRange", () => {
  it("serves the whole file when there is no usable Range header", () => {
    for (const header of [
      null,
      "",
      "items=0-5",
      "bytes=",
      "bytes=-",
      "bytes=abc",
      "bytes=0-5,10-20",
    ]) {
      expect(parseRange(header, 1000)).toEqual({ kind: "whole" });
    }
  });

  it("reads a span, an open-ended span and a suffix", () => {
    expect(parseRange("bytes=0-99", 1000)).toEqual({ kind: "range", start: 0, end: 99 });
    expect(parseRange("bytes=900-", 1000)).toEqual({ kind: "range", start: 900, end: 999 });
    expect(parseRange("bytes=-100", 1000)).toEqual({ kind: "range", start: 900, end: 999 });
    expect(parseRange("bytes=0-0", 1000)).toEqual({ kind: "range", start: 0, end: 0 });
  });

  it("clamps an end past the file, and a suffix longer than the file", () => {
    expect(parseRange("bytes=900-5000", 1000)).toEqual({ kind: "range", start: 900, end: 999 });
    expect(parseRange("bytes=-5000", 1000)).toEqual({ kind: "range", start: 0, end: 999 });
  });

  it("says a span that starts at or past the end can't be satisfied", () => {
    expect(parseRange("bytes=1000-", 1000)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=2000-3000", 1000)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=-0", 1000)).toEqual({ kind: "unsatisfiable" });
  });

  it("ignores a span whose end comes before its start", () => {
    expect(parseRange("bytes=500-100", 1000)).toEqual({ kind: "whole" });
  });
});

const sample = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

describe("audioResponse", () => {
  it("sends the whole file with the format headers and no provider link", async () => {
    const res = audioResponse(sample, null, "req-1");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe("1000");
    expect(res.headers.get("x-audio-format")).toBe("mp3; 16000 Hz; mono; 128 kbps");
    expect(res.headers.get("x-request-id")).toBe("req-1");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(sample);
  });

  it("sends exactly the requested bytes with 206 and a Content-Range", async () => {
    const res = audioResponse(sample, "bytes=100-199", "r");

    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(res.headers.get("content-length")).toBe("100");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(sample.subarray(100, 200));
  });

  it("serves the end of the file for an open-ended and a suffix span", async () => {
    const open = audioResponse(sample, "bytes=990-", "r");
    const suffix = audioResponse(sample, "bytes=-10", "r");

    expect(open.headers.get("content-range")).toBe("bytes 990-999/1000");
    expect(Buffer.from(await open.arrayBuffer())).toEqual(sample.subarray(990));
    expect(Buffer.from(await suffix.arrayBuffer())).toEqual(sample.subarray(990));
  });

  it("answers 416 with the file size for a span past the end", () => {
    const res = audioResponse(sample, "bytes=5000-", "r");

    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */1000");
  });

  it("lines transcript times up with bytes: a 128 kbps file is 16 bytes per millisecond", async () => {
    // One byte value per millisecond of audio, so a cut can be checked by what it contains.
    const bytesPerMs = 16;
    const audio = Buffer.alloc(10_000 * bytesPerMs);
    for (let ms = 0; ms < 10_000; ms++)
      audio.fill(ms % 200, ms * bytesPerMs, (ms + 1) * bytesPerMs);
    const turn = { startMs: 3000, endMs: 7000 };

    const res = audioResponse(
      audio,
      `bytes=${turn.startMs * bytesPerMs}-${turn.endMs * bytesPerMs - 1}`,
      "r",
    );
    const clip = Buffer.from(await res.arrayBuffer());

    expect(clip.length).toBe((turn.endMs - turn.startMs) * bytesPerMs);
    expect(clip[0]).toBe(3000 % 200);
    expect(clip[clip.length - 1]).toBe(6999 % 200);
  });
});

describe("the recording cache", () => {
  it("returns a recording until it expires", () => {
    rememberAudio("a", sample, 1_000);

    expect(cachedAudio("a", 1_000 + 60_000)).toBe(sample);
    expect(cachedAudio("a", 1_000 + 3 * 60_000)).toBeNull();
    expect(cachedAudio("a", 1_000 + 3 * 60_000)).toBeNull();
  });

  it("keeps only the two most recent recordings", () => {
    rememberAudio("a", sample, 1_000);
    rememberAudio("b", sample, 1_001);
    rememberAudio("c", sample, 1_002);

    expect(cachedAudio("a", 1_003)).toBeNull();
    expect(cachedAudio("b", 1_003)).toBe(sample);
    expect(cachedAudio("c", 1_003)).toBe(sample);
  });

  it("forgets a recording on request", () => {
    rememberAudio("a", sample, 1_000);
    forgetAudio("a");

    expect(cachedAudio("a", 1_001)).toBeNull();
  });
});
