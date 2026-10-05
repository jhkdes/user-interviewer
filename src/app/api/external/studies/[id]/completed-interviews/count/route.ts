import { NextResponse } from "next/server";
import { hasValidBearerToken } from "@/lib/bearer-auth";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { countCompletedInterviews } from "@/study-service";

export const dynamic = "force-dynamic";

/**
 * How many interviews in a study are completed and have a transcript — for an
 * external tool (a script, a spreadsheet, a third-party dashboard), not for
 * the dashboard, which has the PM's login and reads the database directly.
 *
 * It lives under `/api/external`, not `/api/studies`, because everything
 * under `/api/studies` is gated by the PM-session middleware (see
 * requiresAuth in route-protection.ts) and an external tool has no session.
 * Instead the caller proves itself with a shared secret:
 *
 *   Authorization: Bearer <EXTERNAL_API_KEY>
 *
 * Authentication is checked before anything else, so a caller without the
 * key learns nothing about which studies exist. See EXTERNAL_API.md.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const apiKey = process.env.EXTERNAL_API_KEY;
  if (!apiKey) {
    // Never serve unauthenticated just because the key was forgotten.
    console.error("Missing required environment variable: EXTERNAL_API_KEY");
    return NextResponse.json({ error: "External API not configured" }, { status: 500 });
  }
  if (!hasValidBearerToken(request, apiKey)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  try {
    const completedInterviews = await countCompletedInterviews(
      { studyRepo: getStudyRepository(), interviewRepo: getInterviewRepository() },
      params.id,
    );
    if (completedInterviews === null) {
      return NextResponse.json({ error: "Study not found" }, { status: 404 });
    }
    return NextResponse.json(
      { studyId: params.id, completedInterviews },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Failed to count completed interviews:", error);
    return NextResponse.json({ error: "Failed to count completed interviews" }, { status: 500 });
  }
}
