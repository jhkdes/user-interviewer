import Link from "next/link";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server-client";
import { LogoutButton } from "./logout-button";

/**
 * Shared chrome for every `/dashboard/*` page (T10.2–T10.5 all sit under
 * here) — top bar with a link back to the study list, the logged-in PM's
 * email, and logout. Kept in a layout rather than repeated per page so
 * adding a new dashboard page never means re-copying header markup.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <Link href="/dashboard" className="font-semibold">
          User Interviewer
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">{user?.email}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
    </div>
  );
}
