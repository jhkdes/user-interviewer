import { NextResponse } from "next/server";
import { corsHeaders, parseAllowedOrigins } from "@/lib/cors";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { countCompletedInterviews, createCompletedCountCache } from "@/study-service";

export const dynamic = "force-dynamic";

/** Where the website that shows this number lives. Add more with PUBLIC_COUNT_ALLOWED_ORIGINS (comma-separated). */
const DEFAULT_ALLOWED_ORIGINS = ["https://discoverfirst.co"];

/** Browsers and the CDN may reuse an answer for this long; a stale one may be served for a few minutes more while a fresh one is fetched. */
const CACHE_CONTROL = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

const countCache = createCompletedCountCache({ ttlMs: 60_000 });

function allowedOrigins(): string[] {
  return parseAllowedOrigins(process.env.PUBLIC_COUNT_ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS);
}

/**
 * The number of completed interviews in one study, for display on a public
 * website: `{ "completedInterviews": 12 }` and nothing else.
 *
 * Unlike /api/external, this needs no key, because a key placed in a web
 * page's JavaScript would be visible to every visitor. What makes that safe:
 *
 *  - It exposes one number for one study, chosen by the PUBLIC_COUNT_STUDY_ID
 *    setting. The request cannot name a study, so it can't be used to read any
 *    other; the study id isn't echoed back either.
 *  - Answers are cached for a minute (in the CDN and in this process), so
 *    visitors don't each cost a database query.
 *  - CORS only lets the listed origins' pages read the response in a browser.
 *    That stops other sites from embedding it; it is not secrecy, since anyone
 *    can call the endpoint directly. The number is meant to be public.
 *
 * See EXTERNAL_API.md.
 */
export async function GET(request: Request) {
  const cors = corsHeaders(request.headers.get("origin"), allowedOrigins());

  const studyId = process.env.PUBLIC_COUNT_STUDY_ID?.trim();
  if (!studyId) {
    console.error("Missing required environment variable: PUBLIC_COUNT_STUDY_ID");
    return NextResponse.json(
      { error: "Unavailable" },
      { status: 503, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  }

  try {
    const completedInterviews = await countCache.get(studyId, () =>
      countCompletedInterviews(
        { studyRepo: getStudyRepository(), interviewRepo: getInterviewRepository() },
        studyId,
      ),
    );
    if (completedInterviews === null) {
      console.error("PUBLIC_COUNT_STUDY_ID does not match any study");
      return NextResponse.json(
        { error: "Unavailable" },
        { status: 503, headers: { ...cors, "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { completedInterviews },
      { headers: { ...cors, "Cache-Control": CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("Failed to count completed interviews for the public count:", error);
    return NextResponse.json(
      { error: "Unavailable" },
      { status: 503, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  }
}

/** CORS preflight. A plain GET from a page doesn't trigger one, but some clients send it anyway. */
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(request.headers.get("origin"), allowedOrigins()),
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
