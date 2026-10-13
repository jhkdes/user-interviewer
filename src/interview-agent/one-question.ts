/**
 * Keeps a spoken interviewer turn to one question.
 *
 * The participant is listening, not reading, so a turn like "What is your
 * target, and have you asked your network?" is hard to hold in your head. The
 * interviewer's prompt already asks for one question per turn, but a model
 * sometimes stacks them anyway, so the app also enforces it: the reply is cut
 * after its first question before it is spoken. Whatever the interviewer still
 * needs, it asks on its next turn.
 *
 * The check is deliberately simple: the first question mark ends the turn
 * (along with any closing quote or bracket right after it). Replies with no
 * question, such as an opening statement or the closing thank-you, are
 * untouched.
 */

/** A question mark plus any closing punctuation that belongs to it. */
const QUESTION_END = /\?[?!"'’”)\]]*/;

/** The turn up to and including its first question; the whole turn if it asks none. */
export function limitToOneQuestion(text: string): string {
  const match = QUESTION_END.exec(text);
  return match ? text.slice(0, match.index + match[0].length) : text;
}

/**
 * The same cut for a reply that arrives in pieces: pass each piece to `push`
 * and speak what it returns. Once the first question has ended, every later
 * piece comes back empty.
 */
export function createOneQuestionLimiter(): { push(piece: string): string } {
  let done = false;
  return {
    push(piece: string): string {
      if (done) return "";
      const match = QUESTION_END.exec(piece);
      if (!match) return piece;
      done = true;
      return piece.slice(0, match.index + match[0].length);
    },
  };
}

/** On unless ONE_QUESTION_PER_TURN is set to false, 0, no, or off. */
export function oneQuestionPerTurnEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env.ONE_QUESTION_PER_TURN?.trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(value ?? "");
}
