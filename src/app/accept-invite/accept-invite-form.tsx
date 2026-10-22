"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, AuthError, authButtonClass, authInputClass } from "@/app/auth-ui";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser-client";

/**
 * Accepts a viewer invite: checks the single-use token from the email, then
 * sets the password for the new session. If the token checks out but the
 * password is refused (too short, say), the person can try another password
 * without the token being checked a second time, since it can only be used once.
 */
export function AcceptInviteForm({ tokenHash }: { tokenHash: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const supabase = createBrowserSupabaseClient();

    if (!verified) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type: "invite",
        token_hash: tokenHash,
      });
      if (verifyError) {
        setSubmitting(false);
        setError(
          "This invitation link is invalid or has expired. Ask the person who invited you to send a new one.",
        );
        return;
      }
      setVerified(true);
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push("/viewer");
    router.refresh();
  }

  return (
    <AuthCard
      title="Set your password"
      description="You have been invited to review interview results. Choose a password to sign in."
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            Password
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
          {submitting ? "Saving…" : "Set password and continue"}
        </button>
      </form>
    </AuthCard>
  );
}
