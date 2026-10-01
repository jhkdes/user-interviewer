import type { StudyReportTheme } from "@/domain";

/** Renders one named section of a report as a list of theme cards — shared by discovery's single "themes" list and feedback's four named categories. Renders nothing when `themes` is empty, so an empty feedback category doesn't show up as an empty heading. */
export function StudyReportThemes({
  title,
  themes,
}: {
  title?: string;
  themes: StudyReportTheme[];
}) {
  if (themes.length === 0) return null;

  return (
    <div className="mt-4 first:mt-0">
      {title && <h3 className="font-medium">{title}</h3>}
      <ul className="mt-2 space-y-4">
        {themes.map((theme) => (
          <li
            key={theme.theme}
            className="rounded border border-neutral-200 p-3 dark:border-neutral-800"
          >
            <p className="font-medium">{theme.theme}</p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {theme.participantCount} participant{theme.participantCount === 1 ? "" : "s"}
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
              {theme.representativeQuotes.map((quote) => (
                <li key={quote}>&quot;{quote}&quot;</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
