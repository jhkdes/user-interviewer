import { getStudyRepository } from "@/repositories/get-study-repository";
import { checkLinkValidity } from "@/study-service/link-validity";
import { InterviewFlow } from "./interview-flow";
import { LinkInvalidScreen } from "./link-invalid-screen";

/**
 * Entry point for the participant-facing flow (M11) — the URL convention
 * `StudyLink` (M10) already generates links against. Link validity (T4.2) is
 * checked server-side, direct repository access, before anything renders —
 * same "Server Component reads are server-only, just like an API route"
 * reasoning M10 used, and it means an expired/closed link never gets far
 * enough to show the intro screen only to fail on submit.
 */
export default async function InterviewPage({
  params,
  searchParams,
}: {
  params: { linkToken: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const study = await getStudyRepository().getByLinkToken(params.linkToken);
  if (!study) return <LinkInvalidScreen reason="not-found" />;

  const validity = checkLinkValidity(study);
  if (validity !== "valid") return <LinkInvalidScreen reason={validity} />;

  // Optional id a third-party tool passes on the link to correlate this
  // interview with its own participant record — see notify-completion-webhook.ts.
  const trackingIdParam = searchParams.tracking_id;
  const trackingId = typeof trackingIdParam === "string" ? trackingIdParam : undefined;

  return <InterviewFlow linkToken={params.linkToken} trackingId={trackingId} />;
}
