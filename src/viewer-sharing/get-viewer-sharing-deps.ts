import { getEmailClient } from "@/lib/email";
import { createServerSupabaseClient } from "@/lib/supabase/client";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { SupabaseViewerAuthAdmin, SupabaseViewerGrantStore } from "./supabase-adapters";
import type { ViewerSharingDeps } from "./viewer-sharing";

/** Resolves the live dependencies for the sharing API routes (server-only). */
export function getViewerSharingDeps(): ViewerSharingDeps {
  const supabase = createServerSupabaseClient();
  return {
    auth: new SupabaseViewerAuthAdmin(supabase),
    store: new SupabaseViewerGrantStore(supabase),
    studyRepo: getStudyRepository(),
    emailClient: getEmailClient(),
  };
}
