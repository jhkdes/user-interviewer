import type { Study } from "@/domain";
import type { StudyRepository } from "@/repositories/study-repository";

/** Which of a study's two participant links a token belongs to. */
export type LinkChannel = "voice" | "text";

export interface ResolvedLink {
  study: Study;
  channel: LinkChannel;
}

/**
 * Finds the study behind a participant link token, and which link it was.
 * The voice link works for every study. The text link only exists for
 * discovery studies (feedback studies offer typing inside the voice link), so
 * a text token that somehow sits on a feedback study resolves to nothing.
 */
export async function resolveLink(
  repo: StudyRepository,
  token: string,
): Promise<ResolvedLink | null> {
  const voice = await repo.getByLinkToken(token);
  if (voice) return { study: voice, channel: "voice" };

  const text = await repo.getByTextLinkToken(token);
  if (text && text.type === "discovery") return { study: text, channel: "text" };

  return null;
}
