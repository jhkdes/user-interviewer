import type { StudyReport, StudyReportTheme } from "@/domain";

export interface CreateStudyReportInput {
  studyId: string;
  themes: StudyReportTheme[];
}

export interface StudyReportRepository {
  /** Persists a new report version for the study — the repository computes the next version number. */
  create(input: CreateStudyReportInput): Promise<StudyReport>;
  getLatestByStudyId(studyId: string): Promise<StudyReport | null>;
  listByStudyId(studyId: string): Promise<StudyReport[]>;
}
