/**
 * PM identity comes from Supabase Auth (auth.users) — there is no separate
 * pm_accounts table for MVP. This type represents the authenticated PM as
 * the rest of the app sees them.
 */
export interface PMAccount {
  id: string;
  email: string;
}
