import { AcceptInviteForm } from "./accept-invite-form";

/**
 * Where an invited viewer lands from the email. The link is only checked when
 * they submit the form, not when the page loads: email security scanners often
 * open links ahead of the reader, and checking on load would use up the
 * single-use token before the person ever sees it.
 */
export default function AcceptInvitePage({
  searchParams,
}: {
  searchParams: { token_hash?: string };
}) {
  const tokenHash = searchParams.token_hash;

  if (!tokenHash) {
    return (
      <main className="min-h-screen bg-neutral-50 px-6 py-16 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="mx-auto max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-xl font-semibold">Invitation link incomplete</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            This link is missing part of its address. Open the link from your invite email again.
          </p>
        </div>
      </main>
    );
  }

  return <AcceptInviteForm tokenHash={tokenHash} />;
}
