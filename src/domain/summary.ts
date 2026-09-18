/**
 * Mirrors Study's type discriminant: which set of fields below is
 * populated. `painPoints`/`notableQuotes`/`takeaways` for "discovery"
 * (empty for "feedback"); `liked`/`disliked`/`suggestions` for "feedback"
 * (empty for "discovery"). Both sets always present on every Summary,
 * same pattern as Study.preInterviewQuestions/feedbackQuestions.
 */
export type SummaryType = "discovery" | "feedback";

export interface Summary {
  id: string;
  interviewId: string;
  type: SummaryType;
  painPoints: string[];
  notableQuotes: string[];
  takeaways: string[];
  liked: string[];
  disliked: string[];
  suggestions: string[];
  createdAt: Date;
}
