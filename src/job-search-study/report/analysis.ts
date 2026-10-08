import type {
  ApplicationProfile,
  Comparison,
  EvidenceLedger,
  ExtractedFacts,
  SourceId,
} from "../ledger/types";
import type {
  ChannelAnalysis,
  ChannelMismatch,
  ChannelRow,
  ComparisonRow,
  ContextRow,
  StartingLineRow,
} from "./types";

/**
 * The deterministic part of the report: tables and context built straight from
 * the ledger and the screener. No model is involved, so every number the
 * participant sees in these sections is one they gave us.
 */

export const SOURCE_LABELS: Record<SourceId, string> = {
  cold_application: "Cold applications",
  referral_from_contact: "Referral or introduction from someone you know",
  recruiter_inbound: "Recruiters who reached out to you",
  recruiter_sought: "Recruiters you sought out",
  former_colleague_or_network: "Former colleagues and your network",
  direct_outreach: "Direct outreach to people you did not know",
  community_or_event: "Communities and events",
  content_or_research: "Content you shared",
  other: "Other",
};

/** A gap of at least this many percentage points between effort and results is flagged. */
const MISMATCH_POINTS = 20;

export function analyzeChannels(facts: ExtractedFacts): ChannelAnalysis {
  const sources = new Set<SourceId>([
    ...facts.sources.map((s) => s.source),
    ...facts.effortSplit.map((s) => s.source),
  ]);

  const countedTotal = facts.sources.reduce((sum, s) => sum + (s.count ?? 0), 0);
  const anyCounts = facts.sources.some((s) => s.count !== null);
  const totalInterviews = facts.totalConversations ?? (anyCounts ? countedTotal : null);

  const rows: ChannelRow[] = [...sources].map((source) => {
    const count = facts.sources.find((s) => s.source === source)?.count ?? null;
    const effort = facts.effortSplit.find((s) => s.source === source);
    return {
      source,
      label: SOURCE_LABELS[source] ?? source,
      interviews: count,
      interviewSharePercent:
        count !== null && totalInterviews !== null && totalInterviews > 0
          ? Math.round((count / totalInterviews) * 100)
          : null,
      effortPercent: effort?.sharePercent ?? null,
      effortNote: effort?.qualitative ?? null,
    };
  });

  // Most results first; rows with no count last.
  rows.sort((a, b) => (b.interviews ?? -1) - (a.interviews ?? -1));

  const withEffort = rows.filter((row) => row.effortPercent !== null || row.effortNote !== null);
  const effortIsNumeric =
    withEffort.length > 0 && withEffort.every((row) => row.effortPercent !== null);

  const mismatches: ChannelMismatch[] = [];
  if (effortIsNumeric) {
    for (const row of rows) {
      if (row.effortPercent === null || row.interviewSharePercent === null) continue;
      const gap = row.effortPercent - row.interviewSharePercent;
      if (gap >= MISMATCH_POINTS) {
        mismatches.push({
          kind: "effort_exceeds_yield",
          source: row.source,
          interviewSharePercent: row.interviewSharePercent,
          effortPercent: row.effortPercent,
        });
      } else if (-gap >= MISMATCH_POINTS) {
        mismatches.push({
          kind: "yield_exceeds_effort",
          source: row.source,
          interviewSharePercent: row.interviewSharePercent,
          effortPercent: row.effortPercent,
        });
      }
    }
  }

  return { rows, totalInterviews, effortIsNumeric, mismatches };
}

function timeText(profile: ApplicationProfile | null): string | null {
  if (!profile) return null;
  if (profile.timeNote) return profile.timeNote;
  return profile.timeMinutes !== null ? `About ${profile.timeMinutes} minutes` : null;
}

/** Side-by-side rows for the typical versus successful table; only rows with something to show on at least one side. */
export function buildComparisonRows(comparison: Comparison): ComparisonRow[] {
  const { typical, successful } = comparison;
  const sourceText = (p: ApplicationProfile | null) =>
    p?.source ? (SOURCE_LABELS[p.source] ?? p.source) : null;

  const rows: ComparisonRow[] = [
    { label: "How it started", typical: sourceText(typical), successful: sourceText(successful) },
    {
      label: "How well it matched",
      typical: typical?.fit ?? null,
      successful: successful?.fit ?? null,
    },
    { label: "Time invested", typical: timeText(typical), successful: timeText(successful) },
    {
      label: "How old the posting was when you applied",
      typical: typical?.postingAge ?? null,
      successful: successful?.postingAge ?? null,
    },
    {
      label: "Research before applying",
      typical: typical?.research ?? null,
      successful: successful?.research ?? null,
    },
    {
      label: "How you positioned yourself",
      typical: typical?.positioning ?? null,
      successful: successful?.positioning ?? null,
    },
    {
      label: "Human contact",
      typical: typical?.humanContact ?? null,
      successful: successful?.humanContact ?? null,
    },
    { label: "AI use", typical: typical?.aiUse ?? null, successful: successful?.aiUse ?? null },
    {
      label: "After submitting",
      typical: typical?.followUp ?? null,
      successful: successful?.followUp ?? null,
    },
  ];
  return rows.filter((row) => row.typical !== null || row.successful !== null);
}

type ScreenerAnswers = Record<string, string | string[]> | null;

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const answerText = (answers: ScreenerAnswers, id: string): string | null => {
  const value = answers?.[id];
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join(", ") : value;
};

/**
 * Context for the "what is affecting your search" section: a few screener
 * answers (marked self-reported) and anything the participant volunteered in
 * the interview. Fields that were not collected are left out; nothing is
 * guessed. Energy, financial pressure, and application pace are never asked,
 * so they appear only if the participant brought them up themselves.
 */
export function buildContextRows(
  screenerAnswers: ScreenerAnswers,
  ledger: EvidenceLedger,
): ContextRow[] {
  const rows: ContextRow[] = [];
  const add = (label: string, id: string, transform: (v: string) => string = (v) => v) => {
    const value = answerText(screenerAnswers, id);
    if (value !== null) rows.push({ label, value: transform(value), origin: "screener" });
  };

  add("Search status", "search_status");
  add("Time searching", "search_duration");
  add("Since your last full-time role", "time_since_full_time");
  add("Level you are targeting compared with your last role", "target_level_vs_recent");
  add("Applications in the past month", "applications_30d", (v) => `${v} (your estimate)`);

  // The extractor sometimes restates a screener answer as something the participant said.
  // Those are not volunteered; drop any item that contains a screener answer's wording.
  const screenerValues = Object.values(screenerAnswers ?? {})
    .flat()
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 6);
  for (const item of ledger.facts.volunteeredContext) {
    const normalized = normalizeText(item);
    if (screenerValues.some((value) => normalized.includes(value))) continue;
    rows.push({ label: "You mentioned", value: item, origin: "interview" });
  }
  return rows;
}

/** The screener's options that say where someone looks for openings (the rest of the question is about people). */
const OPENING_SOURCE_OPTIONS = [
  "General job boards (such as LinkedIn or Indeed)",
  "Niche or industry job boards, newsletters, or listings",
  "Company career pages",
  "Job alerts or saved searches",
];

/**
 * The participant's "starting line": where their search stands today, in
 * their own numbers, to be measured again in a month. Only facts they gave us;
 * rows with no data are left out. Buckets from the screener are shown as
 * estimates and no rate is computed from them, because dividing two coarse
 * ranges would imply precision that is not there.
 */
export function buildStartingLine(
  screenerAnswers: ScreenerAnswers,
  ledger: EvidenceLedger,
  channels: ChannelAnalysis,
): StartingLineRow[] {
  const rows: StartingLineRow[] = [];

  const picked = (
    Array.isArray(screenerAnswers?.channels_used) ? screenerAnswers!.channels_used : []
  ) as string[];
  const lookedAt = OPENING_SOURCE_OPTIONS.filter((option) => picked.includes(option));
  if (lookedAt.length > 0) {
    rows.push({
      label: "Where you look for openings",
      value: lookedAt.join("; "),
      origin: "screener",
    });
  }

  const applications = answerText(screenerAnswers, "applications_30d");
  if (applications !== null) {
    rows.push({
      label: "Applications in the past month",
      value: `${applications} (your estimate)`,
      origin: "screener",
    });
  }

  const counted = ledger.facts.totalConversations;
  const bucket = answerText(screenerAnswers, "conversations_total");
  if (counted !== null) {
    rows.push({
      label: "Recruiter conversations or interviews so far",
      value: String(counted),
      origin: "interview",
    });
  } else if (bucket !== null) {
    rows.push({
      label: "Recruiter conversations or interviews so far",
      value: `${bucket} (your estimate)`,
      origin: "screener",
    });
  }

  const withCounts = channels.rows.filter((row) => row.interviews !== null);
  if (withCounts.length > 0) {
    rows.push({
      label: "Where those conversations came from",
      value: withCounts.map((row) => `${row.label}: ${row.interviews}`).join("; "),
      origin: "interview",
    });
  }

  const time = timeText(ledger.comparison.typical);
  if (time !== null)
    rows.push({
      label: "Time you usually spend on an application",
      value: time,
      origin: "interview",
    });

  const postingAge = ledger.comparison.typical?.postingAge;
  if (postingAge) {
    rows.push({
      label: "How old a role was when you applied",
      value: postingAge,
      origin: "interview",
    });
  }

  return rows;
}
