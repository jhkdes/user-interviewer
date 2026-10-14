import { MIN_PARTICIPANT_TURNS_FOR_REPORT } from "@/job-search-study/min-turns";
import { isTextInterviewModeEnabled } from "@/lib/feature-flags";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { mergeTextCopy } from "@/participant-copy";
import { checkLinkValidity } from "@/study-service/link-validity";
import { resolveLink } from "@/study-service/resolve-link";
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
  const textModeEnabled = isTextInterviewModeEnabled();
  const resolved = await resolveLink(getStudyRepository(), params.linkToken);
  // A study's text link only works while typed interviews are switched on.
  if (!resolved || (resolved.channel === "text" && !textModeEnabled)) {
    return <LinkInvalidScreen reason="not-found" />;
  }
  const { study, channel } = resolved;

  const validity = checkLinkValidity(study);
  if (validity !== "valid") return <LinkInvalidScreen reason={validity} />;

  // Optional id a third-party tool passes on the link to correlate this
  // interview with its own participant record — see notify-completion-webhook.ts.
  const trackingIdParam = searchParams.tracking_id;
  const trackingId = typeof trackingIdParam === "string" ? trackingIdParam : undefined;

  return (
    <InterviewFlow
      linkToken={params.linkToken}
      trackingId={trackingId}
      type={study.type}
      title={study.title}
      description={study.description}
      questions={study.preInterviewQuestions}
      channel={channel}
      copy={
        channel === "text"
          ? mergeTextCopy(study.participantCopyText, study.participantCopy)
          : study.participantCopy
      }
      minParticipantTurns={
        study.reportPipeline === "job-search" ? MIN_PARTICIPANT_TURNS_FOR_REPORT : undefined
      }
      textModeEnabled={textModeEnabled}
    />
  );
}
