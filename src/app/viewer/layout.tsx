import Link from "next/link";
import { LogoutButton } from "@/app/dashboard/logout-button";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server-client";

/**
 * Chrome for the read-only viewer pages (VIEWER_ACCESS.md): no links into
 * `/dashboard`, and a standing note that the pages are read-only. The user's
 * own email is shown so they can tell which account they are signed in as.
 */
export default async function ViewerLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await createServerComponentSupabaseClient().auth.getUser();

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
        <Link href="/viewer" className="font-semibold">
          User Interviewer <span className="font-normal text-neutral-500">· read-only</span>
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
