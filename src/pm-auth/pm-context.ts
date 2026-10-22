import type { PmRole } from "./pm-access";

/** Where a user's role and study grants are stored (`pm_roles`, `study_viewer_grants`). */
export interface PmRoleStore {
  getRole(userId: string): Promise<PmRole | null>;
  listGrantedStudyIds(userId: string): Promise<string[]>;
}

/** The signed-in dashboard user a route handler or page is acting for. */
export interface PmContext {
  userId: string;
  email: string;
  role: PmRole | null;
  /** Studies a viewer may read. Empty for admins (who may read all) and for users with no role. */
  grantedStudyIds: string[];
}

export async function loadPmContext(
  userId: string,
  email: string,
  store: PmRoleStore,
): Promise<PmContext> {
  const role = await store.getRole(userId);
  const grantedStudyIds = role === "viewer" ? await store.listGrantedStudyIds(userId) : [];
  return { userId, email, role, grantedStudyIds };
}

export type StudyAccessResult =
  { ok: true } | { ok: false; status: 401 | 403 | 404; error: string };

/**
 * Whether the user may read data belonging to `studyId` (and, when given,
 * an interview with that `interviewStatus`). Deny by default. A viewer asking
 * for something outside their grants, or an interview that isn't completed,
 * gets 404 rather than 403, so the answer doesn't reveal that it exists.
 */
export function authorizeStudyRead(
  ctx: PmContext | null,
  studyId: string,
  interviewStatus?: string,
): StudyAccessResult {
  if (!ctx) return { ok: false, status: 401, error: "Unauthorized" };
  if (ctx.role === "admin") return { ok: true };
  if (ctx.role === "viewer") {
    const granted = ctx.grantedStudyIds.includes(studyId);
    const visible = interviewStatus === undefined || interviewStatus === "completed";
    return granted && visible ? { ok: true } : { ok: false, status: 404, error: "Not found" };
  }
  return { ok: false, status: 403, error: "Forbidden" };
}
