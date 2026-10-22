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
    <main className="min-h-screen bg-neutral-50 px-6 py-16 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          You have been invited to review interview results. Choose a password to sign in.
        </p>
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
              className="mt-1 block w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:border-neutral-600 dark:bg-neutral-950 dark:focus:border-white dark:focus:ring-white/20"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
            >
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900/40 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {submitting ? "Saving…" : "Set password and continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
