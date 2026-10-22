import { AuthCard } from "@/app/auth-ui";
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
      <AuthCard
        title="Invitation link incomplete"
        description="This link is missing part of its address. Open the link from your invite email again."
      />
    );
  }

  return <AcceptInviteForm tokenHash={tokenHash} />;
}
