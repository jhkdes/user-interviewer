import { notFound } from "next/navigation";
import Link from "next/link";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { EditQuestionsForm } from "./edit-questions-form";

/** Lets a PM add/edit/regenerate a study's pre-interview questions any time after creation. */
export default async function EditQuestionsPage({ params }: { params: { studyId: string } }) {
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

      <h1 className="mt-2 text-xl font-semibold">Edit pre-interview questions</h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        {study.title || "(untitled study)"}
      </p>

      <div className="mt-6">
        <EditQuestionsForm
          studyId={study.id}
          title={study.title}
          description={study.description}
          initialQuestions={study.preInterviewQuestions}
          researchTopic={study.researchTopic}
          customPrompt={study.customPrompt}
        />
      </div>
    </div>
  );
}
