import { notFound, redirect } from "next/navigation";
import { authorizeStudyRead } from "@/pm-auth";
import { getCurrentPmContext } from "@/pm-auth/current-pm-context";
import { getInterviewRepository } from "@/repositories/get-interview-repository";
import { getStudyReportRepository } from "@/repositories/get-study-report-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { getSummaryRepository } from "@/repositories/get-summary-repository";
import { loadViewerStudy, type ViewerStudyData } from "@/viewer-access";

/**
 * The one way a viewer page reads a study: checks the signed-in user may read
 * it, then loads it through the identity-stripping projection. A study the
 * user may not read looks the same as one that does not exist.
 */
export async function requireViewerStudy(studyId: string): Promise<ViewerStudyData> {
  const access = authorizeStudyRead(await getCurrentPmContext(), studyId);
  if (!access.ok) {
    if (access.status === 401) redirect("/login");
    notFound();
  }

  const data = await loadViewerStudy(studyId, {
    studyRepo: getStudyRepository(),
    interviewRepo: getInterviewRepository(),
    summaryRepo: getSummaryRepository(),
    reportRepo: getStudyReportRepository(),
  });
  if (!data) notFound();
  return data;
}
