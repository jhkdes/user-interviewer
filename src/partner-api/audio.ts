/**
 * Serving a recording with HTTP Range support (partner-api-phase1/
 * UI-PARTNER-API-SPEC.md, section 3.6).
 *
 * ElevenLabs ignores Range requests: it always sends the whole file. So UI
 * fetches the whole recording and cuts the requested span itself. To keep a
 * caller that asks for several clips in a row from downloading a 20 MB file
 * each time, the most recent recordings are kept in memory for a couple of
 * minutes. (Serverless instances come and go, so this is a best-effort speed-up,
 * never something correctness depends on.)
 */

export const AUDIO_CONTENT_TYPE = "audio/mpeg";
/** What ElevenLabs sends: MP3, 128 kbps, 16 kHz, one channel with both speakers mixed. */
export const AUDIO_FORMAT = "mp3; 16000 Hz; mono; 128 kbps";

export type ByteRange =
  { kind: "whole" } | { kind: "range"; start: number; end: number } | { kind: "unsatisfiable" };

/**
 * Reads a `Range` header against a file of `size` bytes. Supports one span:
 * `bytes=a-b`, `bytes=a-` and `bytes=-n` (the last n bytes). A header that is
 * absent, in another unit, for several spans, or malformed is ignored, which
 * the HTTP standard allows, and the whole file is sent. A span that starts
 * past the end of the file is unsatisfiable.
 */
export function parseRange(header: string | null, size: number): ByteRange {
  if (!header) return { kind: "whole" };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return { kind: "whole" };
  const [, first, last] = match;
  if (first === "" && last === "") return { kind: "whole" };

  if (first === "") {
    // The last n bytes.
    const n = Number(last);
    if (n === 0) return { kind: "unsatisfiable" };
    return { kind: "range", start: Math.max(size - n, 0), end: size - 1 };
  }

  const start = Number(first);
  const end = last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (last !== "" && Number(last) < start) return { kind: "whole" };
  if (start >= size) return { kind: "unsatisfiable" };
  return { kind: "range", start, end };
}

/** The response for a recording: the whole file (`200`), a span (`206`), or `416` for a span past the end. */
export function audioResponse(
  audio: Buffer,
  rangeHeader: string | null,
  requestId: string,
): Response {
  const size = audio.length;
  const range = parseRange(rangeHeader, size);
  const base = {
    "Content-Type": AUDIO_CONTENT_TYPE,
    "Accept-Ranges": "bytes",
    "X-Audio-Format": AUDIO_FORMAT,
    "X-Request-Id": requestId,
    "Cache-Control": "private, no-store",
  };

  if (range.kind === "unsatisfiable") {
    return new Response(null, {
      status: 416,
      headers: { ...base, "Content-Range": `bytes */${size}` },
    });
  }
  if (range.kind === "range") {
    const slice = audio.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: {
        ...base,
        "Content-Length": String(slice.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }
  return new Response(new Uint8Array(audio), {
    status: 200,
    headers: { ...base, "Content-Length": String(size) },
  });
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_MAX_ENTRIES = 2;
const cache = new Map<string, { audio: Buffer; expiresAt: number }>();

/** A recently fetched recording, if it is still held. */
export function cachedAudio(key: string, now = Date.now()): Buffer | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return entry.audio;
}

export function rememberAudio(key: string, audio: Buffer, now = Date.now()): void {
  for (const [k, entry] of cache) if (entry.expiresAt <= now) cache.delete(k);
  cache.delete(key);
  cache.set(key, { audio, expiresAt: now + CACHE_TTL_MS });
  // Oldest first (Map keeps insertion order).
  while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

/** Forgets a recording, e.g. when it is deleted at the provider. */
export function forgetAudio(key: string): void {
  cache.delete(key);
}

export function clearAudioCache(): void {
  cache.clear();
}
