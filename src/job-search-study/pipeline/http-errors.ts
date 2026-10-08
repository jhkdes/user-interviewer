import { NextResponse } from "next/server";
import {
  InvalidReportEditsError,
  InvalidReportStateError,
  ReleaseBlockedError,
  ReportNotFoundError,
} from "./errors";

/** Maps the review actions' errors to HTTP responses. Anything unexpected is logged and answered with a 500. */
export function reviewErrorResponse(error: unknown): NextResponse {
  if (error instanceof ReportNotFoundError) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  if (error instanceof InvalidReportStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof InvalidReportEditsError) {
    return NextResponse.json({ error: error.message, problems: error.problems }, { status: 400 });
  }
  if (error instanceof ReleaseBlockedError) {
    return NextResponse.json(
      { error: error.message, violations: error.violations },
      { status: 409 },
    );
  }
  console.error("Job-search report action failed:", error);
  return NextResponse.json({ error: "Action failed" }, { status: 500 });
}
