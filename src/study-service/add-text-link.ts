import type { Study } from "@/domain";
import type { StudyRepository } from "@/repositories/study-repository";
import { generateLinkToken } from "./link-token";

/**
 * Gives an existing discovery study its text-only link. Studies created after
 * the text link shipped get one in `createStudy`; this is for the older ones.
 * Idempotent: a study that already has a text link keeps it.
 */
export async function addTextLink(repo: StudyRepository, studyId: string): Promise<Study> {
  const study = await repo.getById(studyId);
  if (!study) throw new Error(`Study not found: ${studyId}`);
  if (study.type !== "discovery") {
    throw new Error("Only discovery studies have a text link; feedback studies offer typing inside their one link.");
  }
  if (study.textLinkToken) return study;

  return repo.setTextLinkToken(studyId, generateLinkToken());
}
