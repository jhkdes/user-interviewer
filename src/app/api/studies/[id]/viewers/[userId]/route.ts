import { NextResponse } from "next/server";
import { requireAdmin } from "@/pm-auth/require-admin";
import { removeViewerAccount, revokeViewerFromStudy } from "@/viewer-sharing";
import { getViewerSharingDeps } from "@/viewer-sharing/get-viewer-sharing-deps";
import { isUuid, sharingErrorResponse } from "@/viewer-sharing/http-errors";

export const dynamic = "force-dynamic";

/**
 * Ends a viewer's access to this study. With `?scope=account` it instead
 * deletes their account, which ends access to every study. Admin only, and
 * only ever applies to viewers.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; userId: string } },
) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!isUuid(params.userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const deps = getViewerSharingDeps();
  try {
    if (new URL(request.url).searchParams.get("scope") === "account") {
      await removeViewerAccount(deps, params.userId);
    } else {
      await revokeViewerFromStudy(deps, params.userId, params.id);
    }
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return sharingErrorResponse(err);
  }
}
