import type { Study } from "@/domain";
import type { StudyRepository } from "@/repositories/study-repository";

export async function closeStudy(repo: StudyRepository, studyId: string): Promise<Study> {
  return repo.updateStatus(studyId, "closed");
}
