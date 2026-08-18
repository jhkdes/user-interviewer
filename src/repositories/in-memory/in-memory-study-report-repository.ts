import { randomUUID } from "node:crypto";
import type { StudyReport } from "@/domain";
import type { CreateStudyReportInput, StudyReportRepository } from "../study-report-repository";

export class InMemoryStudyReportRepository implements StudyReportRepository {
  private reports: StudyReport[] = [];

  async create(input: CreateStudyReportInput): Promise<StudyReport> {
    const existingVersions = this.reports
      .filter((r) => r.studyId === input.studyId)
      .map((r) => r.version);
    const nextVersion = existingVersions.length > 0 ? Math.max(...existingVersions) + 1 : 1;

    const report: StudyReport = {
      id: randomUUID(),
      studyId: input.studyId,
      version: nextVersion,
      themes: input.themes,
      generatedAt: new Date(),
    };
    this.reports.push(report);
    return { ...report };
  }

  async getLatestByStudyId(studyId: string): Promise<StudyReport | null> {
    const forStudy = this.reports.filter((r) => r.studyId === studyId);
    if (forStudy.length === 0) return null;
    return { ...forStudy.reduce((a, b) => (b.version > a.version ? b : a)) };
  }

  async listByStudyId(studyId: string): Promise<StudyReport[]> {
    return this.reports.filter((r) => r.studyId === studyId).map((r) => ({ ...r }));
  }
}
