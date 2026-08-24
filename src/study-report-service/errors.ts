export class StudyNotFoundError extends Error {
  constructor(studyId: string) {
    super(`No study found for id: ${studyId}`);
    this.name = "StudyNotFoundError";
  }
}

export class NoEligibleInterviewsError extends Error {
  constructor(studyId: string) {
    super(
      `Study ${studyId} has no completed interviews with both a transcript and a summary — nothing to report on`,
    );
    this.name = "NoEligibleInterviewsError";
  }
}
