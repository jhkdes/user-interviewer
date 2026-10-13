/**
 * The fewest participant turns an interview needs before a job-search report is
 * made from it. Below this the extraction can be unreliable (it often returns
 * nothing at all at about 6 turns) and too little of the rubric has evidence.
 * Measured on interviews with the one-question-per-turn prompt: about 8 turns
 * rates only Focus, 10 to 14 rate Focus and Pitch, about 16 adds a third area,
 * and about 20 covers all four. 14 is a little above the point where Focus and
 * Pitch both appear, so an interview that is slightly thin does not fail on a
 * coin flip. Finished interviews so far have had 21 to 31 participant turns.
 *
 * An interview with fewer turns is recorded as a failed report, and the browser
 * shows the participant the "ended early" screen with a way to start again.
 *
 * One number, used by the report worker and by the interview page, so the two
 * cannot disagree about what counts as too short.
 */
export const MIN_PARTICIPANT_TURNS_FOR_REPORT = 14;
