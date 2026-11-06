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
 * Every study can have a voice link and a text-only link; the voice link is
 * the one that always exists.
 */
export async function resolveLink(
  repo: StudyRepository,
  token: string,
): Promise<ResolvedLink | null> {
  const voice = await repo.getByLinkToken(token);
  if (voice) return { study: voice, channel: "voice" };

  const text = await repo.getByTextLinkToken(token);
  if (text) return { study: text, channel: "text" };

  return null;
}
