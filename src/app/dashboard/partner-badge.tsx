/** Marks a study that a partner created through the API, with the partner's name, so it is not mistaken for one made in the dashboard. */
export function PartnerBadge({ name }: { name: string }) {
  return (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800 dark:bg-violet-900 dark:text-violet-200">
      Partner · {name}
    </span>
  );
}
