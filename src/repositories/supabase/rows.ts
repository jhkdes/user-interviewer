// Raw row shapes as they come back from Supabase (snake_case), before mapping to domain types.

export interface StudyRow {
  id: string;
  industry: string;
  years_of_experience: string;
  job_title: string;
  seniority: string;
  responsibility: string;
  research_topic: string | null;
  link_token: string;
  status: string;
  created_at: string;
  closed_at: string | null;
}

export interface InterviewRow {
  id: string;
  study_id: string;
  first_name: string;
  email: string;
  role_description: string | null;
  status: string;
  consent_given_at: string | null;
  transcript: unknown;
  recording_url: string | null;
  vapi_call_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  summary_email_sent_at: string | null;
}

export interface SummaryRow {
  id: string;
  interview_id: string;
  pain_points: unknown;
  notable_quotes: unknown;
  takeaways: unknown;
  created_at: string;
}

export interface StudyReportRow {
  id: string;
  study_id: string;
  version: number;
  themes: unknown;
  generated_at: string;
}
