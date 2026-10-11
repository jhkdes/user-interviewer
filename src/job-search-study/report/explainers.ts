import type { DimensionId } from "../rubric/rubric";

/**
 * Plain-language explanations shown in the report so a participant can tell
 * what each area and each level means without having seen the rubric. Kept
 * short on purpose, and free of numbers and the word "score".
 */

export const DIMENSION_EXPLAINERS: Record<DimensionId, string> = {
  focus:
    "Knowing what you are good at and enjoy, choosing a target that fits, and finding and screening the right openings through a regular routine.",
  pitch:
    "How well each application makes the case for interviewing you: a clear story, effort matched to the role, and using AI where it helps while checking what it writes.",
  reach:
    "Getting in front of real people instead of relying only on job boards: referrals, recruiters, and your network.",
  learn:
    "Noticing what is and is not working, and changing course: reading your results, shifting your effort, and trying small experiments.",
};

/** The levels from least to most advanced, so the report can show them as a ladder. */
export const BAND_LADDER: Array<{ id: string; label: string; meaning: string }> = [
  {
    id: "opportunity",
    label: "Opportunity",
    meaning: "You are just getting started here. This is where you have the most room to grow.",
  },
  {
    id: "developing",
    label: "Developing",
    meaning: "Partly in place. Some habits are working and others are not yet consistent.",
  },
  {
    id: "strong",
    label: "Strong",
    meaning: "Consistently in place. Keep doing this.",
  },
];

/** How many steps of the ladder are filled for a level id (1 for the lowest). Zero when there is no level. */
export function ladderSteps(bandId: string | null): number {
  const index = BAND_LADDER.findIndex((band) => band.id === bandId);
  return index + 1;
}
