import { NextResponse } from "next/server";
import { requireAdmin } from "@/pm-auth/require-admin";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { inviteViewer, listStudyViewers } from "@/viewer-sharing";
import { getViewerSharingDeps } from "@/viewer-sharing/get-viewer-sharing-deps";
import { sharingErrorResponse } from "@/viewer-sharing/http-errors";

export const dynamic = "force-dynamic";

/** Who has read-only access to the study. Admin only. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  if (!(await getStudyRepository().getById(params.id))) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }
  return NextResponse.json({ viewers: await listStudyViewers(getViewerSharingDeps(), params.id) });
}

/**
 * Gives someone read-only access to the study, inviting them by email if they
 * have no account yet. Admin only.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  if (!body || typeof body.email !== "string") {
    return NextResponse.json({ error: "An email address is required" }, { status: 400 });
  }

  try {
    const result = await inviteViewer(getViewerSharingDeps(), {
      email: body.email,
      studyIds: [params.id],
      origin: new URL(request.url).origin,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return sharingErrorResponse(err);
  }
}
