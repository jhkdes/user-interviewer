import type { Summary } from "@/domain";

/**
 * The individual-summary rendering shared by the interview detail page and
 * the printable interview export — branches on `summary.type` the same way
 * both places need to (liked/disliked/suggestions for feedback-type,
 * painPoints/notableQuotes/takeaways for discovery-type). Pulled out so the
 * two call sites can't drift from each other.
 */
export function SummarySections({ summary }: { summary: Summary | null }) {
  if (!summary) {
    return (
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        No summary available yet.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-4 text-sm">
      {summary.type === "feedback" ? (
        <>
          <div>
            <p className="font-medium">What they liked</p>
            <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
              {summary.liked.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">What could be better</p>
            <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
              {summary.disliked.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">Suggestions</p>
            <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
              {summary.suggestions.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="font-medium">Pain points</p>
            <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
              {summary.painPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">Notable quotes</p>
            <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
              {summary.notableQuotes.map((quote) => (
                <li key={quote}>&quot;{quote}&quot;</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="font-medium">Takeaways</p>
            <ul className="list-inside list-disc text-neutral-600 dark:text-neutral-400">
              {summary.takeaways.map((takeaway) => (
                <li key={takeaway}>{takeaway}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
