"use client";

import { useState } from "react";
import { AuthCard, AuthError, authButtonClass, authInputClass } from "@/app/auth-ui";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

const linkClass = "text-neutral-600 underline hover:no-underline dark:text-neutral-400";

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
      <AuthCard
        title="Check your email"
        description={`If an account exists for ${email}, a password reset link has been sent.`}
      >
        <p className="mt-6 text-center text-sm">
          <a href="/login" className={linkClass}>
            Back to log in
          </a>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new password."
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className={authInputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {error && <AuthError>{error}</AuthError>}
        <button type="submit" disabled={submitting} className={authButtonClass}>
          {submitting ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <a href="/login" className={linkClass}>
          Back to log in
        </a>
      </p>
    </AuthCard>
  );
}
