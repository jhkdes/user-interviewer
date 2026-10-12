import Link from "next/link";
import { notFound } from "next/navigation";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { ParticipantPagesForm } from "./participant-pages-form";

export const dynamic = "force-dynamic";

/** Lets a PM edit the text of a study's landing and ending pages, with a live preview of both. */
export default async function ParticipantPagesPage({ params }: { params: { studyId: string } }) {
  const study = await getStudyRepository().getById(params.studyId);
  if (!study) notFound();

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
          <ParticipantPagesForm
            studyId={study.id}
            title={study.title}
            description={study.description}
            linkToken={study.linkToken}
            initialCopy={study.participantCopy}
          />
        </div>
      )}
    </div>
  );
}
