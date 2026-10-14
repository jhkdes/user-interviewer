import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { ParticipantPagesForm } from "./participant-pages-form";

export const dynamic = "force-dynamic";

/** Lets a PM edit the text of a study's landing and ending pages, with a live preview of both. */
export default async function ParticipantPagesPage({
  params,
  searchParams,
}: {
  params: { studyId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const study = await getStudyRepository().getById(params.studyId);
  if (!study) notFound();

  // A discovery study with a text link has two sets of pages; `?channel=text` edits the text link's.
  const hasTextLink = study.type === "discovery" && study.textLinkToken !== null;
  const channel = hasTextLink && searchParams.channel === "text" ? "text" : "voice";

  return (
    <div>
      <Link
        href={`/dashboard/studies/${study.id}`}
        className="text-sm text-neutral-500 hover:underline dark:text-neutral-400"
      >
        ← Back to study
      </Link>

      <h1 className="mt-2 text-xl font-semibold">Landing and ending pages</h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        {study.title || "(untitled study)"}
      </p>

      {study.type !== "discovery" ? (
        <p className="mt-6 text-sm">
          Feedback studies use a short fixed intro, so there is nothing to customize here.
        </p>
      ) : (
        <div className="mt-6">
          {hasTextLink && (
            <nav aria-label="Which link" className="mb-6 flex gap-2 text-sm">
              {(["voice", "text"] as const).map((option) => (
                <Link
                  key={option}
                  href={
                    option === "text"
                      ? `/dashboard/studies/${study.id}/participant-pages?channel=text`
                      : `/dashboard/studies/${study.id}/participant-pages`
                  }
                  aria-current={channel === option ? "page" : undefined}
                  className={
                    channel === option
                      ? "rounded-full bg-neutral-900 px-3 py-1 text-white dark:bg-white dark:text-neutral-900"
                      : "rounded-full border border-neutral-300 px-3 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  }
                >
                  {option === "voice" ? "Voice link" : "Text link"}
                </Link>
              ))}
            </nav>
          )}
          <ParticipantPagesForm
            key={channel}
            studyId={study.id}
            title={study.title}
            description={study.description}
            channel={channel}
            linkToken={channel === "text" ? (study.textLinkToken as string) : study.linkToken}
            initialCopy={channel === "text" ? study.participantCopyText : study.participantCopy}
            voiceCopy={study.participantCopy}
          />
        </div>
      )}
    </div>
  );
}
