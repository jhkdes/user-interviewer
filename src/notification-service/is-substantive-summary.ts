/**
 * True if a summary has anything real to reflect back to the participant.
 * A silence-timeout or premature-hangup call can still produce a `Summary`
 * row (generateIndividualSummary only requires a non-empty transcript), but
 * the LLM correctly returns empty arrays when there's nothing substantive to
 * extract — sending a "here's what you told us" email with nothing in it
 * would just look broken (see #6's open question).
 */
export function isSubstantiveSummary(summary: {
  painPoints: string[];
  notableQuotes: string[];
  takeaways: string[];
}): boolean {
  return (
    summary.painPoints.length > 0 ||
    summary.notableQuotes.length > 0 ||
    summary.takeaways.length > 0
  );
}
