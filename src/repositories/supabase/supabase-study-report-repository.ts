import type { SupabaseClient } from "@supabase/supabase-js";
import type { StudyReport } from "@/domain";
import type { CreateStudyReportInput, StudyReportRepository } from "../study-report-repository";
import type { StudyReportRow } from "./rows";

function toStudyReport(row: StudyReportRow): StudyReport {
  return {
    id: row.id,
    studyId: row.study_id,
    version: row.version,
    themes: row.themes as StudyReport["themes"],
    generatedAt: new Date(row.generated_at),
  };
}

export class SupabaseStudyReportRepository implements StudyReportRepository {
  constructor(private readonly client: SupabaseClient) {}

  async create(input: CreateStudyReportInput): Promise<StudyReport> {
    const { data: existing, error: fetchError } = await this.client
      .from("study_reports")
      .select("version")
      .eq("study_id", input.studyId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`Failed to determine next report version: ${fetchError.message}`);
    }
    const nextVersion = existing ? (existing.version as number) + 1 : 1;

    const { data, error } = await this.client
      .from("study_reports")
      .insert({ study_id: input.studyId, version: nextVersion, themes: input.themes })
      .select()
      .single();

    if (error) throw new Error(`Failed to create study report: ${error.message}`);
    return toStudyReport(data as StudyReportRow);
  }

  async getLatestByStudyId(studyId: string): Promise<StudyReport | null> {
    const { data, error } = await this.client
      .from("study_reports")
      .select()
      .eq("study_id", studyId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch latest study report: ${error.message}`);
    return data ? toStudyReport(data as StudyReportRow) : null;
  }

  async listByStudyId(studyId: string): Promise<StudyReport[]> {
    const { data, error } = await this.client
      .from("study_reports")
      .select()
      .eq("study_id", studyId)
      .order("version", { ascending: true });

    if (error) throw new Error(`Failed to list study reports: ${error.message}`);
    return (data as StudyReportRow[]).map(toStudyReport);
  }
}
