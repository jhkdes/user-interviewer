import { describe, expect, it } from "vitest";
import { IncrementalJsonStringExtractor } from "../incremental-json-string-extractor";

/** Feeds a full JSON fragment split into fixed-size chunks, to simulate arbitrary stream boundaries. */
function feedInChunks(extractor: IncrementalJsonStringExtractor, text: string, chunkSize: number): string {
  let out = "";
  for (let i = 0; i < text.length; i += chunkSize) {
    out += extractor.feed(text.slice(i, i + chunkSize));
  }
  return out;
}

describe("IncrementalJsonStringExtractor", () => {
  it("extracts a simple string value fed as one whole chunk", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const out = extractor.feed('{"utterance": "Hello there", "shouldEndInterview": false}');
    expect(out).toBe("Hello there");
    expect(extractor.isDone).toBe(true);
  });

  it("streams characters incrementally across many small chunks", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const full = '{"utterance": "Hello there, how are you?", "shouldEndInterview": false}';
    const out = feedInChunks(extractor, full, 3);
    expect(out).toBe("Hello there, how are you?");
    expect(extractor.isDone).toBe(true);
  });

  it("finds the field even when it isn't the first key in the object", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const out = extractor.feed('{"shouldEndInterview": false, "utterance": "Second field"}');
    expect(out).toBe("Second field");
  });

  it("handles no whitespace after the colon", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const out = extractor.feed('{"utterance":"No space"}');
    expect(out).toBe("No space");
  });

  it("decodes standard escape sequences", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const out = extractor.feed(String.raw`{"utterance": "Line1\nLine2\tTabbed \"quoted\" and \\backslash\\"}`);
    expect(out).toBe('Line1\nLine2\tTabbed "quoted" and \\backslash\\');
    expect(extractor.isDone).toBe(true);
  });

  it("decodes a unicode escape sequence", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const out = extractor.feed('{"utterance": "caf\\u00e9"}');
    expect(out).toBe("café");
  });

  it("correctly handles an escape sequence split across chunk boundaries", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const full = String.raw`{"utterance": "quote: \" end"}`;
    // Split right in the middle of the \" escape sequence.
    const splitIndex = full.indexOf('\\"') + 1;
    const out = extractor.feed(full.slice(0, splitIndex)) + extractor.feed(full.slice(splitIndex));
    expect(out).toBe('quote: " end');
  });

  it("correctly handles a unicode escape sequence split across chunk boundaries", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const full = '{"utterance": "caf\\u00e9"}';
    const splitIndex = full.indexOf("\\u") + 3; // split mid-hex-digits
    const out = extractor.feed(full.slice(0, splitIndex)) + extractor.feed(full.slice(splitIndex));
    expect(out).toBe("café");
  });

  it("stops at the closing quote and ignores everything after it", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const out = extractor.feed('{"utterance": "Done here"} some trailing garbage "utterance": "ignored"');
    expect(out).toBe("Done here");
    expect(extractor.isDone).toBe(true);
    expect(extractor.feed("more text")).toBe("");
  });

  it("returns empty string and stays not-done while waiting for the key to appear", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    expect(extractor.feed('{"shouldEndInterview": false')).toBe("");
    expect(extractor.isDone).toBe(false);
  });

  it("returns empty string while waiting for the colon or opening quote to arrive", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    expect(extractor.feed('{"utterance"')).toBe("");
    expect(extractor.feed(" ")).toBe("");
    expect(extractor.feed(":")).toBe("");
    expect(extractor.feed("  ")).toBe("");
    const out = extractor.feed('"Finally"');
    expect(out).toBe("Finally");
  });

  it("gives up quietly if the field turns out not to be a string", () => {
    const extractor = new IncrementalJsonStringExtractor("shouldEndInterview");
    const out = extractor.feed('{"shouldEndInterview": false, "utterance": "text"}');
    expect(out).toBe("");
    expect(extractor.isDone).toBe(true);
  });

  it("handles an empty string value", () => {
    const extractor = new IncrementalJsonStringExtractor("utterance");
    const out = extractor.feed('{"utterance": ""}');
    expect(out).toBe("");
    expect(extractor.isDone).toBe(true);
  });
});
