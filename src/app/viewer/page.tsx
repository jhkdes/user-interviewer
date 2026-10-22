import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentPmContext } from "@/pm-auth/current-pm-context";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { toViewerStudy } from "@/viewer-access";

/** The studies a viewer has been granted. Admins have the full dashboard instead. */
export default async function ViewerHomePage() {
  const ctx = await getCurrentPmContext();
  if (!ctx) redirect("/login");
  if (ctx.role === "admin") redirect("/dashboard");
  if (ctx.role !== "viewer") {
    return <p className="text-sm">You don&apos;t have access to this page.</p>;
  }

  const studyRepo = getStudyRepository();
  const studies = (await Promise.all(ctx.grantedStudyIds.map((id) => studyRepo.getById(id))))
    .filter((study) => study !== null)
    .map(toViewerStudy)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div>
      <h1 className="text-xl font-semibold">Studies</h1>
      {studies.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500 dark:text-neutral-400">
          No studies have been shared with you yet.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
          {studies.map((study) => (
            <li key={study.id}>
              <Link
                href={`/viewer/studies/${study.id}`}
                className="flex items-center justify-between py-4 hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <div>
                  <p className="font-medium">{study.title || "(untitled study)"}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {study.description || "No description yet"}
                  </p>
                </div>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-sm capitalize text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  {study.type}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
