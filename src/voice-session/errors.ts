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

/**
 * A voice turn arrived for an interview that is no longer a voice interview
 * — the participant restarted it as a typing interview, and this is a late
 * request from the discarded call. Routes answer it with a 409 so nothing is
 * generated or written.
 */
export class InterviewNotVoiceError extends Error {
  constructor(interviewId: string) {
    super(`Interview ${interviewId} is a typing interview; its voice call was discarded`);
    this.name = "InterviewNotVoiceError";
  }
}
