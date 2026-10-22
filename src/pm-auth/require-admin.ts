import { NextResponse } from "next/server";
import { getCurrentPmContext } from "./current-pm-context";

/**
 * For route handlers that hand out or take away access. The middleware
 * already keeps viewers off `/api/studies`; this repeats the check inside the
 * handler so these routes stay admin-only even if a viewer allowlist entry is
 * ever widened. Returns the response to send back, or null when the caller is
 * an admin. Server-only: not exported from the package index.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const ctx = await getCurrentPmContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}
