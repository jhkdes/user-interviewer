import type { LinkValidity } from "@/study-service/link-validity";

/**
 * T11.5 — shown instead of the interview flow when the link doesn't resolve
 * to an open study. "not-found" (bad/mistyped token) is a distinct case from
 * T4.2's `LinkValidity` ("closed" | "expired"), which only applies once a
 * study is actually found.
 */
type Reason = Exclude<LinkValidity, "valid"> | "not-found";

export function LinkInvalidScreen({ reason }: { reason: Reason }) {
  const copy: Record<Reason, { title: string; body: string }> = {
    "not-found": {
      title: "Link not found",
      body: "This interview link doesn't look right. Double check the link you were sent, or contact whoever shared it with you.",
    },
    closed: {
      title: "This study is no longer accepting interviews",
      body: "The team running this study has closed it to new participants. Thanks for your interest — feel free to contact whoever shared this link with you if you have questions.",
    },
    expired: {
      title: "This link has expired",
      body: "Interview links are only valid for 7 days. If you'd still like to participate, reach out to whoever shared this link with you for a new one.",
    },
  };
  const { title, body } = copy[reason];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">{body}</p>
    </main>
  );
}
