import { NextResponse } from "next/server";
import {
  AlreadyAdminError,
  InvalidEmailError,
  InviteAlreadyAcceptedError,
  InviteEmailError,
  NotAViewerError,
  ViewerStudyNotFoundError,
} from "./viewer-sharing";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Turns a sharing error into the response the dashboard shows; anything unexpected is rethrown. */
export function sharingErrorResponse(err: unknown): NextResponse {
  if (err instanceof InvalidEmailError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof ViewerStudyNotFoundError || err instanceof NotAViewerError) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (err instanceof AlreadyAdminError || err instanceof InviteAlreadyAcceptedError) {
    return NextResponse.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof InviteEmailError) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
  throw err;
}
