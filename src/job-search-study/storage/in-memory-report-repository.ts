import { randomUUID } from "node:crypto";
import type {
  EnqueueJobSearchReportInput,
  JobSearchReport,
  JobSearchReportPatch,
  JobSearchReportRepository,
} from "./types";

/** A deep copy, so callers cannot change stored state by mutating what they were given. */
const copy = (report: JobSearchReport): JobSearchReport => structuredClone(report);

export class InMemoryJobSearchReportRepository implements JobSearchReportRepository {
  private reports = new Map<string, JobSearchReport>();

  /** Overridable so tests can control time. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  async enqueue(input: EnqueueJobSearchReportInput) {
    for (const existing of this.reports.values()) {
      if (existing.interviewId === input.interviewId)
        return { report: copy(existing), created: false };
    }
    const now = this.now();
    const report: JobSearchReport = {
      id: randomUUID(),
      interviewId: input.interviewId,
      studyId: input.studyId,
      status: input.status ?? "pending",
      rubricVersion: null,
      extractionRuns: [],
      aggregate: null,
      scoring: null,
      pack: null,
      comparison: null,
      generatedReport: null,
      report: null,
      narrativeViolations: [],
      textViolations: [],
      error: input.error ?? null,
      attempts: 0,
      accessToken: null,
      releasedAt: null,
      releasedBy: null,
      emailSentAt: null,
      withdrawnAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.reports.set(report.id, report);
    return { report: copy(report), created: true };
  }

  async getById(id: string) {
    const report = this.reports.get(id);
    return report ? copy(report) : null;
  }

  async getByInterviewId(interviewId: string) {
    for (const report of this.reports.values()) {
      if (report.interviewId === interviewId) return copy(report);
    }
    return null;
  }

  async getByAccessToken(token: string) {
    for (const report of this.reports.values()) {
      if (report.accessToken !== null && report.accessToken === token) return copy(report);
    }
    return null;
  }

  async listByStudyId(studyId: string) {
    return [...this.reports.values()]
      .filter((report) => report.studyId === studyId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(copy);
  }

  async claimNext(options: { staleBefore: Date }) {
    const candidates = [...this.reports.values()]
      .filter(
        (report) =>
          report.status === "pending" ||
          (report.status === "generating" &&
            report.updatedAt.getTime() < options.staleBefore.getTime()),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const next = candidates[0];
    if (!next) return null;

    next.status = "generating";
    next.updatedAt = this.now();
    return copy(next);
  }

  async update(id: string, patch: JobSearchReportPatch) {
    const report = this.reports.get(id);
    if (!report) throw new Error(`Job-search report not found: ${id}`);
    Object.assign(report, structuredClone(patch), { updatedAt: this.now() });
    return copy(report);
  }
}
