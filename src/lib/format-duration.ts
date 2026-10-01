/** Formats a duration in seconds as "M:SS" — minutes unpadded, seconds always two digits (e.g. "2:05", "12:34"). Shared by the live in-call elapsed timer and the interview detail page's duration/transcript timestamps, so the format never drifts between the two. */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
