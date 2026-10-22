/**
 * Shared look for the signed-out pages (invite, login): a centred card, input
 * fields with a visible border, and a solid submit button. Kept in one place so
 * those pages cannot drift apart, and so a field is always clearly a field and
 * the main action is always clearly a button.
 */

export const authInputClass =
  "mt-1 block w-full rounded-md border border-neutral-400 bg-white px-3 py-2 text-sm placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/20 dark:border-neutral-600 dark:bg-neutral-950 dark:focus:border-white dark:focus:ring-white/20";

export const authButtonClass =
  "w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-neutral-900/40 disabled:opacity-60 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-neutral-50 px-6 py-16 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto max-w-sm rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-xl font-semibold">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
        )}
        {children}
      </div>
    </main>
  );
}

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
    >
      {children}
    </p>
  );
}
