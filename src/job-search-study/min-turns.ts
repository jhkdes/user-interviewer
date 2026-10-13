/**
 * The fewest participant turns an interview needs before a job-search report is
 * made from it. Below this the extraction is unreliable (it often returns
 * nothing at all) and too little of the rubric has evidence: with about 8 turns
 * only the Focus area can be rated, and with about 12 Focus and Pitch can. An
 * interview with fewer turns is recorded as a failed report, and the browser
 * shows the participant the "ended early" screen with a way to start again.
 *
 * One number, used by the report worker and by the interview page, so the two
 * cannot disagree about what counts as too short.
 */
export const MIN_PARTICIPANT_TURNS_FOR_REPORT = 12;
