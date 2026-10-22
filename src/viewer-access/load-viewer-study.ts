import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyReportRepository } from "@/repositories/study-report-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import type { SummaryRepository } from "@/repositories/summary-repository";
import { toViewerInterview, toViewerStudy, toViewerStudyReport } from "./to-viewer";
import type { ViewerStudyData } from "./viewer-types";

export interface ViewerStudyDeps {
  studyRepo: StudyRepository;
  interviewRepo: InterviewRepository;
  summaryRepo: SummaryRepository;
  reportRepo: StudyReportRepository;
}

/**
 * Everything a viewer sees for one study, already stripped of participant
 * identity. This is the only way viewer pages and routes should read study
 * data. The caller must have checked that the viewer is granted this study.
 *
 * Only completed interviews are returned. Numbering counts every interview in
 * the study by creation time, so a participant keeps their number when
 * another interview finishes; hidden interviews leave gaps.
 *
 * Returns null for an unknown study.
 */
export async function loadViewerStudy(
  studyId: string,
  { studyRepo, interviewRepo, summaryRepo, reportRepo }: ViewerStudyDeps,
): Promise<ViewerStudyData | null> {
  const study = await studyRepo.getById(studyId);
  if (!study) return null;

  const all = [...(await interviewRepo.listByStudyId(studyId))].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );

  const completed = all
    .map((interview, index) => ({ interview, position: index + 1 }))
    .filter(({ interview }) => interview.status === "completed");
  const interviews = await Promise.all(
    completed.map(async ({ interview, position }) =>
      toViewerInterview(interview, position, await summaryRepo.getByInterviewId(interview.id)),
    ),
  );

  // A report summarises every participant, so it is cleaned against all their names.
  const report = await reportRepo.getLatestByStudyId(studyId);
  const allNames = all.map((i) => i.firstName);

  return {
    study: toViewerStudy(study),
    interviews,
    report: report ? toViewerStudyReport(report, allNames) : null,
  };
}
