function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface InviteEmailInput {
  studyTitles: string[];
  /** The page where the person sets a password and signs in. */
  acceptUrl: string;
}

/** The email that invites someone to read a study's results. */
export function renderInviteEmail({ studyTitles, acceptUrl }: InviteEmailInput): {
  subject: string;
  html: string;
} {
  const studies = studyTitles.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  const url = escapeHtml(acceptUrl);

  return {
    subject: "You've been invited to review interview results",
    html: `<div style="font-family: system-ui, sans-serif; max-width: 520px;">
<p>You've been given read-only access to interview results for:</p>
<ul>${studies}</ul>
<p>You can read transcripts, listen to recordings, and see summaries. Participants' names and email addresses are not shown, and nothing can be changed or deleted.</p>
<p><a href="${url}" style="display: inline-block; padding: 10px 16px; background: #171717; color: #ffffff; text-decoration: none; border-radius: 4px;">Set a password and sign in</a></p>
<p style="color: #666666; font-size: 13px;">If the button doesn't work, copy this link into your browser:<br>${url}</p>
<p style="color: #666666; font-size: 13px;">The link works once. If it has expired, ask the person who invited you to send a new one.</p>
</div>`,
  };
}
