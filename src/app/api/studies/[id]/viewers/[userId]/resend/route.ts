import { NextResponse } from "next/server";
import { requireAdmin } from "@/pm-auth/require-admin";
import { resendInvite } from "@/viewer-sharing";
import { getViewerSharingDeps } from "@/viewer-sharing/get-viewer-sharing-deps";
import { isUuid, sharingErrorResponse } from "@/viewer-sharing/http-errors";

export const dynamic = "force-dynamic";

/** Emails a fresh invite to a viewer who has not accepted the first one. Admin only. */
export async function POST(
  request: Request,
  { params }: { params: { id: string; userId: string } },
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!isUuid(params.userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await resendInvite(
      getViewerSharingDeps(),
      params.userId,
      params.id,
      new URL(request.url).origin,
    );
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return sharingErrorResponse(err);
  }
}
