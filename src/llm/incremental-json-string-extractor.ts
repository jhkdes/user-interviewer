/**
 * Incrementally decodes the string value of one named field out of a JSON
 * object as it streams in fragments (Anthropic's tool-use `input_json_delta`
 * events deliver raw, often mid-token, JSON text — not necessarily valid
 * JSON on its own). Used to forward a tool call's `utterance` argument live,
 * character by character, rather than waiting for the whole tool call to
 * finish generating.
 *
 * Only decodes the target field — everything before it (other keys, the
 * object's opening brace) is buffered and discarded once found; everything
 * after its closing quote is ignored, since nothing past that point is
 * needed for the streaming preview (the fully-parsed tool input, once the
 * call completes, remains the source of truth for the final value).
 */
export class IncrementalJsonStringExtractor {
  private readonly marker: string;
  private preamble = "";
  private valueStarted = false;
  private done = false;
  private pendingEscape = "";

  constructor(key: string) {
    this.marker = `"${key}"`;
  }

  get isDone(): boolean {
    return this.done;
  }

  /** Feeds the next raw JSON fragment; returns any newly-decoded characters of the target field's value (possibly ""). */
  feed(chunk: string): string {
    if (this.done) return "";

    if (!this.valueStarted) {
      this.preamble += chunk;
      const keyIndex = this.preamble.indexOf(this.marker);
      if (keyIndex === -1) return "";

      let i = keyIndex + this.marker.length;
      while (i < this.preamble.length && this.preamble[i] !== ":") i++;
      if (i >= this.preamble.length) return ""; // colon hasn't arrived yet
      i++;
      while (i < this.preamble.length && /\s/.test(this.preamble[i])) i++;
      if (i >= this.preamble.length) return ""; // opening quote hasn't arrived yet
      if (this.preamble[i] !== '"') {
        // Not a string value — nothing sensible to stream. Give up quietly.
        this.done = true;
        return "";
      }

      this.valueStarted = true;
      const rest = this.preamble.slice(i + 1);
      this.preamble = "";
      return this.consume(rest);
    }

    return this.consume(chunk);
  }

  private consume(rawChunk: string): string {
    const chunk = this.pendingEscape + rawChunk;
    this.pendingEscape = "";

    let out = "";
    let i = 0;
    while (i < chunk.length) {
      const ch = chunk[i];

      if (ch === "\\") {
        const escapeChar = chunk[i + 1];
        if (escapeChar === undefined) {
          this.pendingEscape = chunk.slice(i);
          break;
        }
        if (escapeChar === "u") {
          const hex = chunk.slice(i + 2, i + 6);
          if (hex.length < 4) {
            this.pendingEscape = chunk.slice(i);
            break;
          }
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        const simpleEscapes: Record<string, string> = {
          '"': '"',
          "\\": "\\",
          "/": "/",
          b: "\b",
          f: "\f",
          n: "\n",
          r: "\r",
          t: "\t",
        };
        out += simpleEscapes[escapeChar] ?? escapeChar;
        i += 2;
        continue;
      }

      if (ch === '"') {
        this.done = true;
        return out;
      }

      out += ch;
      i++;
    }
    return out;
  }
}
