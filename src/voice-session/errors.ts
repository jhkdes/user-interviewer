export class MissingInterviewIdError extends Error {
  constructor(context: string) {
    super(`${context} has no resolvable interviewId — cannot route it`);
    this.name = "MissingInterviewIdError";
  }
}

export class InterviewNotFoundError extends Error {
  constructor(interviewId: string) {
    super(`No interview found for id: ${interviewId}`);
    this.name = "InterviewNotFoundError";
  }
}

export class StudyNotFoundError extends Error {
  constructor(studyId: string) {
    super(`No study found for id: ${studyId}`);
    this.name = "StudyNotFoundError";
  }
}
