"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
    <main style={{ padding: 24, maxWidth: 400, fontFamily: "system-ui" }}>
      <h1>Set your password</h1>
      <p>You have been invited to review interview results. Choose a password to sign in.</p>
      <form onSubmit={handleSubmit}>
        <label style={{ display: "block", marginTop: 16 }}>
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
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
          {submitting ? "Saving…" : "Set password and continue"}
        </button>
      </form>
    </main>
  );
}
