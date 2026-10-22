"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, AuthError, authButtonClass, authInputClass } from "@/app/auth-ui";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

/**
 * Password reset, step 2 of 2 (T9.3). Reached via `/auth/callback` after
 * the reset-email link exchanges its `code` for a real (recovery) session —
 * that session is what makes `updateUser` below allowed to succeed.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthCard title="Set a new password" description="Choose a new password for your account.">
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            placeholder="At least 6 characters"
            className={authInputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <AuthError>{error}</AuthError>}
        <button type="submit" disabled={submitting} className={authButtonClass}>
          {submitting ? "Saving…" : "Set password"}
        </button>
      </form>
    </AuthCard>
  );
}
