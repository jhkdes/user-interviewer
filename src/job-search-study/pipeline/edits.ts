import type { DimensionId, Rubric } from "../rubric/rubric";
import { checkNarrative, checkReportText, type NarrativeText } from "../report/check-narrative";
import { loadExperimentLibrary } from "../report/experiments";
import { expectationsFor, type NarrativePack } from "../report/narrative";
import type { Report, ReportExperiment } from "../report/types";
import { InvalidReportEditsError } from "./errors";

/** What a reviewer may change. Anything left out stays as it is. Scores, bands, and tables are computed and cannot be edited. */
export interface ReportEdits {
  priority?: string | null;
  executiveSummary?: string;
  whatWeHeard?: string;
  channelsNarrative?: string;
  bottomLine?: string;
  dimensions?: Array<{ id: DimensionId; strengthText?: string; improvementText?: string }>;
  /** Replaces the suggested experiments with these library ids, in this order. At most 3. */
  experimentIds?: string[];
}

const MAX_EXPERIMENTS = 3;
const REQUIRED_TEXT: Array<
  keyof Pick<ReportEdits, "executiveSummary" | "whatWeHeard" | "bottomLine">
> = ["executiveSummary", "whatWeHeard", "bottomLine"];

/** Applies a reviewer's edits to a report. Throws InvalidReportEditsError if they are not acceptable. */
export function applyEdits(rubric: Rubric, current: Report, edits: ReportEdits): Report {
  const problems: string[] = [];

  for (const field of REQUIRED_TEXT) {
    if (edits[field] !== undefined && !edits[field]!.trim())
      problems.push(`${field} cannot be empty`);
  }
  const dimensionIds = new Set(current.dimensions.map((d) => d.id));
  for (const edit of edits.dimensions ?? []) {
    if (!dimensionIds.has(edit.id)) problems.push(`Unknown dimension ${edit.id}`);
  }

  let experiments: ReportExperiment[] | undefined;
  if (edits.experimentIds !== undefined) {
    const library = loadExperimentLibrary(rubric).experiments;
    if (edits.experimentIds.length > MAX_EXPERIMENTS)
      problems.push(`At most ${MAX_EXPERIMENTS} experiments`);
    if (new Set(edits.experimentIds).size !== edits.experimentIds.length)
      problems.push("Experiments must be distinct");
    experiments = [];
    for (const id of edits.experimentIds) {
      const found = library.find((experiment) => experiment.id === id);
      if (!found) {
        problems.push(`Unknown experiment ${id}`);
        continue;
      }
      const existing = current.experiments.find((experiment) => experiment.id === id);
      experiments.push({
        id: found.id,
        title: found.title,
        forBehavior: found.behavior,
        why: found.why,
        steps: found.steps,
        effort: found.effort,
        track: found.track,
        reason: existing?.reason ?? "Chosen by a reviewer",
      });
    }
  }

  if (problems.length > 0) throw new InvalidReportEditsError(problems);

  return {
    ...current,
    priority:
      edits.priority !== undefined
        ? edits.priority?.trim()
          ? edits.priority.trim()
          : null
        : current.priority,
    executiveSummary: edits.executiveSummary?.trim() ?? current.executiveSummary,
    whatWeHeard: edits.whatWeHeard?.trim() ?? current.whatWeHeard,
    channelsNarrative: edits.channelsNarrative?.trim() ?? current.channelsNarrative,
    bottomLine: edits.bottomLine?.trim() ?? current.bottomLine,
    dimensions: current.dimensions.map((dimension) => {
      const edit = edits.dimensions?.find((candidate) => candidate.id === dimension.id);
      if (!edit) return dimension;
      return {
        ...dimension,
        strengthText: edit.strengthText?.trim() ?? dimension.strengthText,
        improvementText: edit.improvementText?.trim() ?? dimension.improvementText,
      };
    }),
    experiments: experiments ?? current.experiments,
  };
}

/** The narrative parts of a report, in the shape the writer's rule checks expect. */
export function narrativeOf(report: Report): NarrativeText {
  return {
    executiveSummary: report.executiveSummary,
    whatWeHeard: report.whatWeHeard,
    channelsNarrative: report.channelsNarrative,
    bottomLine: report.bottomLine,
    dimensions: report.dimensions.map((d) => ({
      id: d.id,
      strengthText: d.strengthText,
      improvementText: d.improvementText,
    })),
  };
}

/** Re-runs the same rule checks the writer's output goes through, so a reviewer sees what is still wrong after editing. */
export function recheckViolations(report: Report, pack: NarrativePack | null) {
  const narrativeViolations = pack
    ? checkNarrative(narrativeOf(report), expectationsFor(pack))
    : [];
  const textViolations = checkReportText([
    { where: "the priority", text: report.priority },
    ...report.startingLine.map((row) => ({
      where: `starting line "${row.label}"`,
      text: row.value,
    })),
    ...report.context.map((row) => ({ where: `context "${row.label}"`, text: row.value })),
  ]);
  return { narrativeViolations, textViolations };
}
