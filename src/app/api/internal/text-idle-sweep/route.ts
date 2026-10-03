import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runTextIdleSweep } from "@/text-session";
import { getTextSessionDeps } from "@/text-session/get-text-session-deps";

export const dynamic = "force-dynamic";
/** Ending an interview runs a summary and an email, so a sweep can take a while. */
export const maxDuration = 60;

function isAuthorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Never run unauthenticated just because the secret was forgotten.
    console.error("Missing required environment variable: CRON_SECRET");
    return NextResponse.json({ error: "Sweep not configured" }, { status: 500 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runTextIdleSweep(getTextSessionDeps());
    console.log(
      `Text idle sweep: checked ${result.checked}, nudged ${result.nudged.length}, ` +
        `completed ${result.completed.length}, deferred ${result.deferred}, ` +
        `cleaned up ${result.cleanedUp.length}`,
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Text idle sweep failed:", error);
    return NextResponse.json({ error: "Sweep failed" }, { status: 500 });
  }
}

/**
 * Idle handling for text interviews (nudge, inactivity timeout, time-cap
 * close, cleanup), run about once a minute by a scheduler. Protected by a
 * shared secret sent as `Authorization: Bearer <CRON_SECRET>` — the format
 * Vercel Cron uses. Accepts GET (what Vercel Cron sends) and POST (manual
 * runs). See TEXT_INTERVIEW_MODE.md.
 */
export const GET = handle;
export const POST = handle;
