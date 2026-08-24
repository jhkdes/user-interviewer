/**
 * Which request paths require a logged-in PM session (T9.2). Kept as a pure
 * function, independent of Next.js middleware/cookies plumbing, so the
 * routing decision itself is unit-testable without a real Supabase session.
 *
 * `/api/studies/:linkToken/interviews` is the one exception under
 * `/api/studies` — it's the participant-facing intake endpoint (M5),
 * addressed by a public link token rather than a study id, and participants
 * never log in (see REQUIREMENTS.md). Everything else under `/api/studies`
 * (create, list, get, close, report) is a PM-only action. `/api/vapi/*`
 * isn't listed here at all — it's called by Vapi's servers, never a
 * logged-in PM, and must stay reachable without a session.
 */
export function requiresAuth(pathname: string): boolean {
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/api/studies")) return !pathname.endsWith("/interviews");
  return false;
}
