import Link from "next/link";
import { getPartnerRepository } from "@/repositories/get-partner-repository";
import { getStudyRepository } from "@/repositories/get-study-repository";
import { getLinkExpiryInfo } from "@/study-service";
import { PartnerBadge } from "./partner-badge";

/** Small "Expires in Xd" / "Link expired" indicator so a PM can see it's about to go dead before it actually does, without opening each study. Nothing shown for a closed study — there's no countdown to report. */
function ExpiryBadge({
  expiresAt,
  daysRemaining,
  validity,
  isExpiringSoon,
}: ReturnType<typeof getLinkExpiryInfo>) {
  if (!expiresAt) return null;

  if (validity === "expired") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-900 dark:text-red-200">
        Link expired
      </span>
    );
  }

  return (
    <span
      className={
        isExpiringSoon
          ? "rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
          : "rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
      }
    >
      Expires in {daysRemaining}d
    </span>
  );
}

type OriginFilter = "all" | "partner" | "own";

const FILTERS: { value: OriginFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "partner", label: "Partner" },
  { value: "own", label: "Dashboard" },
];

/** Study list (T10.2) — the dashboard's landing page. `?show=partner` or `?show=own` narrows it to studies made through the partner API, or in the dashboard. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const studies = await getStudyRepository().list();
  const hasPartnerStudies = studies.some((study) => study.partnerId !== null);
  // Only asked for when a partner study exists, so the page works before the partners table does.
  const partnerNames = new Map<string, string>(
    hasPartnerStudies ? (await getPartnerRepository().list()).map((p) => [p.id, p.name]) : [],
  );
  const show: OriginFilter =
    searchParams.show === "partner" || searchParams.show === "own" ? searchParams.show : "all";
  const sorted = studies
    .filter(
      (study) =>
        show === "all" ||
        (show === "partner" ? study.partnerId !== null : study.partnerId === null),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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

      {hasPartnerStudies && (
        <nav aria-label="Which studies" className="mt-4 flex gap-2 text-sm">
          {FILTERS.map(({ value, label }) => (
            <Link
              key={value}
              href={value === "all" ? "/dashboard" : `/dashboard?show=${value}`}
              aria-current={show === value ? "page" : undefined}
              className={
                show === value
                  ? "rounded-full bg-neutral-900 px-3 py-1 text-white dark:bg-white dark:text-neutral-900"
                  : "rounded-full border border-neutral-300 px-3 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              }
            >
              {label}
            </Link>
          ))}
        </nav>
      )}

      {sorted.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-500 dark:text-neutral-400">
          {studies.length === 0
            ? 'No studies yet. Click "New Study" to create one.'
            : "No studies match this filter."}
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
                  <p className="font-medium">{study.title || "(untitled study)"}</p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {study.description || "No description yet"}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 capitalize text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {study.type}
                  </span>
                  {study.partnerId && (
                    <PartnerBadge name={partnerNames.get(study.partnerId) ?? "unknown partner"} />
                  )}
                  <ExpiryBadge {...getLinkExpiryInfo(study)} />
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
