import type { Interview, Study } from "@/domain";
import type { ConversationDeleteResult } from "@/lib/elevenlabs/client";
import type { InterviewRepository } from "@/repositories/interview-repository";
import type { StudyRepository } from "@/repositories/study-repository";
import { forgetAudio } from "./audio";

/** A recording could not be removed at the provider, so nothing of the interview was deleted here either. */
export class ProviderDeleteError extends Error {
  constructor(public readonly failedCount: number) {
    super(
      failedCount === 1
        ? "A recording could not be deleted at the provider."
        : `${failedCount} recordings could not be deleted at the provider.`,
    );
    this.name = "ProviderDeleteError";
  }
}

export interface DeleteDeps {
  interviews: InterviewRepository;
  studies: StudyRepository;
  /** Removes a conversation and its audio at ElevenLabs. */
  deleteConversation: (conversationId: string) => Promise<ConversationDeleteResult>;
}

/**
 * Removes an interview's recording at the provider. A conversation the
 * provider no longer has counts as removed, so a retry after a half-finished
 * delete picks up where it stopped.
 */
async function removeRecording(deps: DeleteDeps, interview: Interview): Promise<boolean> {
  const conversationId = interview.elevenLabsConversationId;
  if (!conversationId) return true;
  const result = await deps.deleteConversation(conversationId);
  if (result === "failed") return false;
  forgetAudio(conversationId);
  return true;
}

/**
 * Deletes an interview: its recording at ElevenLabs first, then the interview
 * itself (transcript, summary, any waiting webhook event). If the recording
 * cannot be removed, nothing is deleted and the caller can retry. Otherwise a
 * deleted-looking interview could leave its audio behind with no way to find it.
 */
export async function deletePartnerInterview(deps: DeleteDeps, interview: Interview) {
  if (!(await removeRecording(deps, interview))) throw new ProviderDeleteError(1);
  await deps.interviews.delete(interview.id);
}

/**
 * Deletes a study with everything under it: every interview's recording at
 * ElevenLabs, then its interviews, then the study row, which takes its
 * invitations and waiting webhook events with it. If any recording cannot be removed, the rest
 * are still attempted but the study and its data stay, so a retry finishes the job.
 */
export async function deletePartnerStudy(deps: DeleteDeps, study: Study) {
  const interviews = await deps.interviews.listByStudyId(study.id);
  let failed = 0;
  for (const interview of interviews) {
    if (!(await removeRecording(deps, interview))) failed++;
  }
  if (failed > 0) throw new ProviderDeleteError(failed);
  // Interviews first, explicitly; the study row then takes its invitations and waiting webhook events with it.
  for (const interview of interviews) await deps.interviews.delete(interview.id);
  await deps.studies.delete(study.id);
}
