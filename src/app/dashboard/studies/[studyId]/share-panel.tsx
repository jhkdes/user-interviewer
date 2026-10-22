"use client";

import { useCallback, useEffect, useState } from "react";

interface StudyViewer {
  userId: string;
  email: string;
  status: "invited" | "active";
}

const INVITE_RESULT: Record<string, string> = {
  invited: "Invite sent.",
  "invite-resent": "They hadn't accepted their earlier invite, so a new one was sent.",
  "access-added": "Access added. They already have an account, so no email was sent.",
};

async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Something went wrong (${res.status})`;
}

/**
 * Admin-only panel on the study page: who has read-only access to this
 * study, with invite, resend and revoke. Viewers see transcripts, audio and
 * summaries under "Participant N", never names or emails.
 */
export function SharePanel({ studyId }: { studyId: string }) {
  const [viewers, setViewers] = useState<StudyViewer[] | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  const base = `/api/studies/${studyId}/viewers`;

  const load = useCallback(async () => {
    const res = await fetch(base);
    if (!res.ok) {
      setMessage({ text: await errorMessage(res), isError: true });
      return;
    }
    setViewers(((await res.json()) as { viewers: StudyViewer[] }).viewers);
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<Response>, success: (res: Response) => Promise<string>) {
    setBusy(true);
    setMessage(null);
    const res = await action();
    if (res.ok) {
      setMessage({ text: await success(res), isError: false });
      await load();
    } else {
      setMessage({ text: await errorMessage(res), isError: true });
    }
    setBusy(false);
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    void run(
      () =>
        fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        }),
      async (res) => {
        setEmail("");
        const { outcome } = (await res.json()) as { outcome: string };
        return INVITE_RESULT[outcome] ?? "Done.";
      },
    );
  }

  function revoke(viewer: StudyViewer) {
    if (!window.confirm(`Remove ${viewer.email} from this study?`)) return;
    void run(
      () => fetch(`${base}/${viewer.userId}`, { method: "DELETE" }),
      async () => `Removed ${viewer.email} from this study.`,
    );
  }

  function removeAccount(viewer: StudyViewer) {
    const warning = `Delete the account for ${viewer.email}? They lose access to every study, not just this one.`;
    if (!window.confirm(warning)) return;
    void run(
      () => fetch(`${base}/${viewer.userId}?scope=account`, { method: "DELETE" }),
      async () => `Deleted the account for ${viewer.email}.`,
    );
  }

  function resend(viewer: StudyViewer) {
    void run(
      () => fetch(`${base}/${viewer.userId}/resend`, { method: "POST" }),
      async () => `Sent a new invite to ${viewer.email}.`,
    );
  }

  return (
    <section className="mt-8">
      <h2 className="font-semibold">Share with a viewer</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        A viewer can read completed interviews, transcripts, recordings and summaries. Participant
        names and emails are hidden, and they can&apos;t change or delete anything.
      </p>

      {viewers === null ? (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      ) : viewers.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          No one has access yet.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-neutral-200 dark:divide-neutral-800">
          {viewers.map((viewer) => (
            <li key={viewer.userId} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span>{viewer.email}</span>
                <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {viewer.status === "invited" ? "Invited" : "Active"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {viewer.status === "invited" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resend(viewer)}
                    className="underline hover:no-underline disabled:opacity-50"
                  >
                    Resend invite
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => revoke(viewer)}
                  className="underline hover:no-underline disabled:opacity-50"
                >
                  Remove from study
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => removeAccount(viewer)}
                  className="text-red-600 underline hover:no-underline disabled:opacity-50 dark:text-red-400"
                >
                  Delete account
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={invite} className="mt-4 flex items-center gap-2">
        <input
          type="email"
          required
          placeholder="Email address"
          aria-label="Email address to invite"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-64 rounded border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Invite
        </button>
      </form>

      {message && (
        <p
          role={message.isError ? "alert" : "status"}
          className={`mt-2 text-sm ${message.isError ? "text-red-600 dark:text-red-400" : "text-neutral-600 dark:text-neutral-400"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
