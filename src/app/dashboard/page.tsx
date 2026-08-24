import Link from "next/link";
import { getStudyRepository } from "@/repositories/get-study-repository";

/** Study list (T10.2) — the dashboard's landing page. */
export default async function DashboardPage() {
  const studies = await getStudyRepository().list();
  const sorted = [...studies].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Studies</h1>
        <Link
          href="/dashboard/studies/new"
          className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          New Study
        </Link>
      </div>

      {sorted.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500 dark:text-neutral-400">
          No studies yet. Click &quot;New Study&quot; to create one.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
          {sorted.map((study) => (
            <li key={study.id}>
              <Link
                href={`/dashboard/studies/${study.id}`}
                className="flex items-center justify-between py-4 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div>
                  <p className="font-medium">{study.targetProfile.jobTitle}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {study.targetProfile.industry} · {study.targetProfile.seniority}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span
                    className={
                      study.status === "open"
                        ? "rounded-full bg-green-100 px-2 py-0.5 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "rounded-full bg-neutral-200 px-2 py-0.5 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    }
                  >
                    {study.status}
                  </span>
                  <span className="text-neutral-400">{study.createdAt.toLocaleDateString()}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
