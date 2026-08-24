import { NextResponse } from "next/server";
import { createServerComponentSupabaseClient } from "@/lib/supabase/server-client";

/**
 * Supabase Auth redirect target (T9.3) — both the password-reset email link
 * and (if ever used) an email-confirmation link land here with a `code`
 * query param, which must be exchanged for a real session before the user
 * can do anything (e.g. `updateUser` on `/reset-password`). `next` controls
 * where to send them afterward; defaults to the reset-password form since
 * that's this milestone's only caller of this route.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/reset-password";

  if (code) {
    const supabase = createServerComponentSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
