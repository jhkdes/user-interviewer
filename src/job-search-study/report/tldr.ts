import type { Report } from "./types";

/**
 * The short version shown at the top of the report: what is working well,
 * what is not working as well, and the experiments to try. Computed from the
 * report itself (the same strengths, gaps, and experiments shown further
 * down), so it always agrees with the rest of the page, including a
 * reviewer's edits to the experiments. No model is involved and no new
 * numbers or claims can enter.
 */

export interface Tldr {
  workingWell: string[];
  notWorkingAsWell: string[];
  experiments: string[];
}

export function buildTldr(report: Report): Tldr {
  const workingWell: string[] = [];
  const notWorkingAsWell: string[] = [];

  for (const dimension of report.dimensions) {
    const name = (id: string | null) => dimension.behaviors.find((b) => b.id === id)?.name;
    const strength = name(dimension.strength);
    const gap = name(dimension.improvement);
    if (strength) workingWell.push(`${dimension.name}: ${strength}`);
    if (gap) notWorkingAsWell.push(`${dimension.name}: ${gap}`);
  }

  return {
    workingWell,
    notWorkingAsWell,
    experiments: report.experiments.map((experiment) => experiment.title),
  };
}
