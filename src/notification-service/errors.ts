export class InterviewNotFoundError extends Error {
  constructor(interviewId: string) {
    super(`No interview found for id: ${interviewId}`);
    this.name = "InterviewNotFoundError";
  }
}
