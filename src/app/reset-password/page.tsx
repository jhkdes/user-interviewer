"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    <main style={{ padding: 24, maxWidth: 400, fontFamily: "system-ui" }}>
      <h1>Set a new password</h1>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginTop: 16 }}>
          New password
          <input
            type="password"
            required
            minLength={6}
            style={{ display: "block", width: "100%" }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" style={{ color: "crimson", marginTop: 12 }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} style={{ marginTop: 16 }}>
          {submitting ? "Saving…" : "Set password"}
        </button>
      </form>
    </main>
  );
}
