"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

/** Password reset, step 1 of 2 (T9.3): request a reset email. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createBrowserSupabaseClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <main style={{ padding: 24, maxWidth: 400, fontFamily: "system-ui" }}>
        <h1>Check your email</h1>
        <p>If an account exists for {email}, a password reset link has been sent.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 400, fontFamily: "system-ui" }}>
      <h1>Reset your password</h1>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginTop: 16 }}>
          Email
          <input
            type="email"
            required
            style={{ display: "block", width: "100%" }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" style={{ color: "crimson", marginTop: 12 }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} style={{ marginTop: 16 }}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
    </main>
  );
}
