export class InterviewNotFoundError extends Error {
  constructor(interviewId: string) {
    super(`No interview found for id: ${interviewId}`);
    this.name = "InterviewNotFoundError";
  }
}

export class MissingTranscriptError extends Error {
  constructor(interviewId: string) {
    super(`Interview ${interviewId} has no transcript to summarize`);
    this.name = "MissingTranscriptError";
  }
}
