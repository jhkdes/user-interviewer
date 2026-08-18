/**
 * Live integration test for the Claude adapter only runs with a real API
 * key set — otherwise it skips rather than fails, same pattern as the
 * Supabase integration tests (see src/repositories/supabase/__tests__/test-env.ts).
 */
export const hasAnthropicTestEnv = Boolean(process.env.ANTHROPIC_API_KEY);
