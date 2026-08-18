/**
 * Integration tests only run when pointed at a real (test) Supabase project.
 * Locally/CI without SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set, they skip
 * rather than fail — see PROGRESS.md open follow-ups.
 */
export const hasSupabaseTestEnv = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);
