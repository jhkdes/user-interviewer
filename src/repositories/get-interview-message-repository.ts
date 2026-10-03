import { createServerSupabaseClient } from "@/lib/supabase/client";
import type { InterviewMessageRepository } from "./interview-message-repository";
import { SupabaseInterviewMessageRepository } from "./supabase/supabase-interview-message-repository";

/** Resolves the live InterviewMessageRepository for API routes (server-only). */
export function getInterviewMessageRepository(): InterviewMessageRepository {
  return new SupabaseInterviewMessageRepository(createServerSupabaseClient());
}
