/**
 * The allow-list of browser origins for a public, read-only endpoint, parsed
 * from a comma-separated setting. Falls back to `defaults` when the setting is
 * unset or blank. Origins are compared exactly (scheme, host, and port), so
 * `https://discoverfirst.co` does not also allow `https://www.discoverfirst.co`
 * — list both if both are needed.
 */
export function parseAllowedOrigins(setting: string | undefined, defaults: string[]): string[] {
  const parsed = (setting ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin !== "");
  return parsed.length > 0 ? parsed : defaults;
}

/**
 * The CORS response headers for a request from `origin`.
 *
 * An allowed origin gets `Access-Control-Allow-Origin` set to exactly that
 * origin, so its page can read the response. Any other origin — or a request
 * with no `Origin` header at all, such as curl or another server — gets none:
 * the response is the same, but a browser won't let a page from a
 * non-listed site read it. `Vary: Origin` is always sent so a shared cache
 * never serves one origin's CORS headers to another.
 *
 * This limits which websites' scripts can read the endpoint from a visitor's
 * browser; it is not authentication, and anyone can still call the endpoint
 * directly. Use it only for data that is fine to be public.
 */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin !== null && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
