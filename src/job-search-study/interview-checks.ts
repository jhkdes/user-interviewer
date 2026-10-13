import type { InterviewTurn } from "@/llm";

/**
 * Deterministic checks on a finished (usually simulated) job-search interview
 * transcript — the parts of "did the interviewer behave?" that need no LLM.
 * Whether the six priority evidence items were actually covered needs a
 * judgment call, so that lives in the simulation script instead.
 */

/** Rough spoken duration: ~150 words per minute. */
const WORDS_PER_SECOND = 2.5;

export function estimateSpokenSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / WORDS_PER_SECOND;
}

/** Phrases that mean the interviewer is coaching, scoring, or praising a tactic. */
const COACHING_PHRASES = [
  "you should",
  "i recommend",
  "i suggest",
  "my advice",
  "you might want to",
  "you ought to",
  "a better approach",
  "your score",
  "you scored",
  "great strategy",
  "good strategy",
  "smart move",
];

export interface CoachingViolation {
  turnIndex: number;
  phrase: string;
}

export function findCoachingViolations(turns: InterviewTurn[]): CoachingViolation[] {
  const violations: CoachingViolation[] = [];
  turns.forEach((turn, turnIndex) => {
    if (turn.speaker !== "interviewer") return;
    const lower = turn.text.toLowerCase();
    for (const phrase of COACHING_PHRASES) {
      if (lower.includes(phrase)) violations.push({ turnIndex, phrase });
    }
  });
  return violations;
}

/**
 * Acknowledgments that pass judgment on the participant's choices ("that makes
 * sense", "smart move"). The prompt asks for content-neutral acknowledgments
 * ("Got it", "Thanks") so participants aren't nudged toward answers that earn
 * approval. Reported as a count, not a hard failure: a little is tolerable.
 */
const EVALUATIVE_PHRASES = [
  "makes sense",
  "good to know",
  "good call",
  "smart",
  "solid",
  "great",
  "clear reason",
  "really clear",
  "good example",
  "that's a useful",
  "that's a meaningful",
  "that's helpful",
  "useful to know",
  "understandable",
  "really common",
  "comes up",
];

export interface EvaluativeAcknowledgment {
  turnIndex: number;
  phrase: string;
}

export function findEvaluativeAcknowledgments(turns: InterviewTurn[]): EvaluativeAcknowledgment[] {
  const found: EvaluativeAcknowledgment[] = [];
  turns.forEach((turn, turnIndex) => {
    if (turn.speaker !== "interviewer") return;
    const lower = turn.text.toLowerCase();
    for (const phrase of EVALUATIVE_PHRASES) {
      if (lower.includes(phrase)) found.push({ turnIndex, phrase });
    }
  });
  return found;
}

/** Screener questions the interviewer is told never to re-ask, with a pattern that recognizes re-asking. */
const SCREENER_REASK_PATTERNS: Record<string, RegExp> = {
  search_duration: /how long (?:have you been|has it been) (?:actively )?(?:searching|looking)/i,
  current_level: /what (?:level|seniority) (?:are|were|is) (?:you|your)/i,
  applications_30d:
    /how many (?:job )?applications (?:have you|did you) (?:submit|send|put in)[^?]*(?:month|30 days)/i,
  conversations_total:
    /how many (?:recruiter conversations|interviews)[^?]*(?:have you had|so far|since you started|in total|overall)/i,
};

export interface ScreenerReask {
  turnIndex: number;
  screenerId: string;
}

export function findRepeatedScreenerQuestions(turns: InterviewTurn[]): ScreenerReask[] {
  const reasks: ScreenerReask[] = [];
  turns.forEach((turn, turnIndex) => {
    if (turn.speaker !== "interviewer") return;
    for (const [screenerId, pattern] of Object.entries(SCREENER_REASK_PATTERNS)) {
      if (pattern.test(turn.text)) reasks.push({ turnIndex, screenerId });
    }
  });
  return reasks;
}

/** The prompt gives exact wording, but the interviewer sometimes paraphrases it ("what would you most want help figuring out"). */
const REPORT_PRIORITY_PATTERN = /(?:help|guidance)[^?]*figur(?:e|ing)|one part of your job search/i;

/**
 * The index of the interviewer turn that asked the "report priority" closing
 * question, or `null` if it was never asked. `answered` is true when a
 * participant turn follows it — the question is only useful if it was answered.
 */
export function findReportPriorityQuestion(
  turns: InterviewTurn[],
): { turnIndex: number; answered: boolean } | null {
  const turnIndex = turns.findIndex(
    (turn) => turn.speaker === "interviewer" && REPORT_PRIORITY_PATTERN.test(turn.text),
  );
  if (turnIndex === -1) return null;
  const answered = turns.slice(turnIndex + 1).some((turn) => turn.speaker === "participant");
  return { turnIndex, answered };
}

/** Whether the interviewer asked how old the posting was when the participant applied. */
export function askedPostingAge(turns: InterviewTurn[]): boolean {
  return turns.some(
    (turn) =>
      turn.speaker === "interviewer" &&
      /(how (long|old)|how many (days|weeks))[^?]*(posted|posting|up)\b|\bposted[^?]*(when you applied|before you applied)/i.test(
        turn.text,
      ),
  );
}

/** Support types where the interviewer must ask which provider or program it is (the answer is research data). */
const PROVIDER_REQUIRED_SUPPORT = [/^outplacement/i, /^a free program/i];

/** Whether the screener says the participant has outplacement or a free program, so the provider name must be asked for. */
export function needsSupportProviderQuestion(
  screenerAnswers: Record<string, string | string[]> | null | undefined,
): boolean {
  const answer = screenerAnswers?.search_support;
  const picked = Array.isArray(answer) ? answer : answer ? [answer] : [];
  return picked.some((option) => PROVIDER_REQUIRED_SUPPORT.some((pattern) => pattern.test(option)));
}

/** Whether the interviewer asked which outplacement provider, program, or coach the participant uses. */
export function askedSupportProvider(turns: InterviewTurn[]): boolean {
  return turns.some(
    (turn) =>
      turn.speaker === "interviewer" &&
      /\b(?:which|what)\b[^?]*\b(?:outplacement|program|provider|firm|company|coach)\b|\bwho(?:'s| is) (?:that|it|the \w+) with\b|\bwho(?:'s| is) (?:your|the) coach\b/i.test(
        turn.text,
      ),
  );
}

/** An interviewer turn that asks more than one question, which is hard to hold in your head when you are listening. */
export interface CompoundQuestion {
  turnIndex: number;
  /** How many separate questions the turn seems to ask. */
  questions: number;
}

/**
 * A second question tacked onto the first, with no question mark of its own: "and" or "plus"
 * followed by a question word or a verb that starts a question, or "or" followed by a new
 * question word. "Is that deliberate, or did it just happen?" is one either/or question.
 */
const JOINED_QUESTION =
  /[,;]?\s+(?:and|plus)\s+(?:also\s+)?(?:what|how|why|when|where|who|which|did|do|does|have|has|had|are|is|was|were|can|could|would|will)\b|\s+or\s+(?:what|how|why|when|where|who|which)\b/i;

/**
 * Interviewer turns that ask more than one question: two or more question
 * marks, or one question with a second joined on by "and" or "or". An
 * either/or about the same thing ("is that open on purpose, or not decided
 * yet?") is one question and does not count. A heuristic, so it is for
 * measuring how often it happens, not for judging a single turn.
 */
export function findCompoundQuestions(turns: InterviewTurn[]): CompoundQuestion[] {
  const found: CompoundQuestion[] = [];
  turns.forEach((turn, turnIndex) => {
    if (turn.speaker !== "interviewer") return;
    const marks = (turn.text.match(/\?/g) ?? []).length;
    let questions = marks;
    if (marks === 1) {
      const question = turn.text.slice(0, turn.text.indexOf("?"));
      // Only the sentence that holds the question mark counts.
      const sentence = question.split(/(?<=[.!])\s+/).pop() ?? question;
      if (JOINED_QUESTION.test(sentence)) {
        questions = 2;
      }
    }
    if (questions >= 2) found.push({ turnIndex, questions });
  });
  return found;
}

/** Whether the interviewer asked how the participant worked out their strengths and what they enjoy. */
export function askedStrengths(turns: InterviewTurn[]): boolean {
  return turns.some(
    (turn) =>
      turn.speaker === "interviewer" &&
      /\b(?:good at|best at|strengths?)\b[^?]*\?|\bwhat (?:work )?you enjoy\b/i.test(turn.text),
  );
}

export interface InterviewChecks {
  participantTurns: number;
  interviewerTurns: number;
  estimatedMinutes: number;
  coachingViolations: CoachingViolation[];
  evaluativeAcknowledgments: EvaluativeAcknowledgment[];
  screenerReasks: ScreenerReask[];
  reportPriority: { turnIndex: number; answered: boolean } | null;
  postingAgeAsked: boolean;
  strengthsAsked: boolean;
  /** Interviewer turns that asked more than one question. */
  compoundQuestions: CompoundQuestion[];
  /** True when the screener shows outplacement or a free program and the interviewer never asked which one. */
  supportProviderMissing: boolean;
  /** The last interviewer turn is a statement, not a question (the harness requires a closing turn with no question). */
  closesWithStatement: boolean;
}

export function runInterviewChecks(
  turns: InterviewTurn[],
  elapsedSeconds: number,
  screenerAnswers?: Record<string, string | string[]> | null,
): InterviewChecks {
  const interviewerTurns = turns.filter((turn) => turn.speaker === "interviewer");
  const lastInterviewerTurn = interviewerTurns[interviewerTurns.length - 1];

  return {
    participantTurns: turns.filter((turn) => turn.speaker === "participant").length,
    interviewerTurns: interviewerTurns.length,
    estimatedMinutes: Math.round((elapsedSeconds / 60) * 10) / 10,
    coachingViolations: findCoachingViolations(turns),
    evaluativeAcknowledgments: findEvaluativeAcknowledgments(turns),
    screenerReasks: findRepeatedScreenerQuestions(turns),
    reportPriority: findReportPriorityQuestion(turns),
    postingAgeAsked: askedPostingAge(turns),
    strengthsAsked: askedStrengths(turns),
    compoundQuestions: findCompoundQuestions(turns),
    supportProviderMissing:
      needsSupportProviderQuestion(screenerAnswers) && !askedSupportProvider(turns),
    closesWithStatement: lastInterviewerTurn
      ? !lastInterviewerTurn.text.trim().endsWith("?")
      : false,
  };
}
