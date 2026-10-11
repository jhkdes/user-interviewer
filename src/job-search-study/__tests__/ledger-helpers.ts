import type { InterviewTurn } from "@/llm";
import type { Rubric } from "../rubric/rubric";
import type { ApplicationProfile, BehaviorEvidence, EvidenceLedger } from "../ledger/types";

/** A small transcript used across ledger tests: turns 0, 2, 4 are the interviewer; 1, 3, 5 are the participant. */
export const SAMPLE_TRANSCRIPT: InterviewTurn[] = [
  { speaker: "interviewer", text: "Walk me through your most recent application." },
  {
    speaker: "participant",
    text: "So, uh, I found it on LinkedIn, and I, I think it took, um, ten to fifteen minutes. I use one of three resumes.",
  },
  { speaker: "interviewer", text: "Roughly how many matched your target?" },
  { speaker: "participant", text: "Probably most of them, at least the recent ones." },
  { speaker: "interviewer", text: "Where do the conversations come from?" },
  { speaker: "participant", text: "Two were recruiters reaching out. The rest I applied to." },
];

export function insufficientEntry(id: BehaviorEvidence["id"]): BehaviorEvidence {
  return {
    id,
    status: "insufficient_evidence",
    score: null,
    evidenceBasis: null,
    subSignals: [],
    quotes: [],
    confidenceNote: null,
    trajectoryNote: null,
    statusReason: "Not discussed",
  };
}

/** A structurally valid ledger with every behavior insufficient; tests override entries as needed. */
export function blankLedger(rubric: Rubric): EvidenceLedger {
  return {
    rubricVersion: rubric.version,
    behaviors: rubric.behaviors.map((behavior) => insufficientEntry(behavior.id)),
    facts: {
      targetSummary: null,
      matchRate: { matched: null, outOf: null, basis: null },
      totalConversations: null,
      sources: [],
      effortSplit: [],
      volunteeredContext: [],
      supportProviders: [],
    },
    comparison: {
      typical: null,
      successful: null,
      successfulIsFurthestProgressOnly: false,
      describedApplicationIsTypical: null,
      participantExplanation: null,
    },
    reportPriority: null,
    conflicts: [],
  };
}

export function withEntry(ledger: EvidenceLedger, entry: BehaviorEvidence): EvidenceLedger {
  return {
    ...ledger,
    behaviors: ledger.behaviors.map((existing) => (existing.id === entry.id ? entry : existing)),
  };
}

const orEmpty = (value: string | null) => value ?? "";
const orMinusOne = (value: number | null) => value ?? -1;

function profileToWire(profile: ApplicationProfile | null) {
  if (!profile) return [];
  return [
    {
      ...profile,
      source: profile.source ?? "none",
      fit: orEmpty(profile.fit),
      timeMinutes: orMinusOne(profile.timeMinutes),
      timeNote: orEmpty(profile.timeNote),
      postingAge: orEmpty(profile.postingAge),
      research: orEmpty(profile.research),
      positioning: orEmpty(profile.positioning),
      humanContact: orEmpty(profile.humanContact),
      aiUse: orEmpty(profile.aiUse),
      followUp: orEmpty(profile.followUp),
    },
  ];
}

/** The inverse of fromWireLedger: what the model would send for a given ledger. */
export function toWireLedger(ledger: EvidenceLedger) {
  return {
    behaviors: ledger.behaviors.map((entry) => ({
      ...entry,
      score: entry.score ?? -1,
      evidenceBasis: entry.evidenceBasis ?? "none",
      confidenceNote: orEmpty(entry.confidenceNote),
      trajectoryNote: orEmpty(entry.trajectoryNote),
      statusReason: orEmpty(entry.statusReason),
    })),
    facts: {
      targetSummary: orEmpty(ledger.facts.targetSummary),
      matchRate: {
        matched: orMinusOne(ledger.facts.matchRate.matched),
        outOf: orMinusOne(ledger.facts.matchRate.outOf),
        basis: ledger.facts.matchRate.basis ?? "none",
      },
      totalConversations: orMinusOne(ledger.facts.totalConversations),
      sources: ledger.facts.sources.map((s) => ({ ...s, count: orMinusOne(s.count) })),
      effortSplit: ledger.facts.effortSplit.map((s) => ({
        ...s,
        sharePercent: orMinusOne(s.sharePercent),
        qualitative: orEmpty(s.qualitative),
      })),
      volunteeredContext: ledger.facts.volunteeredContext,
      supportProviders: ledger.facts.supportProviders,
    },
    comparison: {
      typical: profileToWire(ledger.comparison.typical),
      successful: profileToWire(ledger.comparison.successful),
      successfulIsFurthestProgressOnly: ledger.comparison.successfulIsFurthestProgressOnly,
      describedApplicationIsTypical:
        ledger.comparison.describedApplicationIsTypical === null
          ? "unknown"
          : ledger.comparison.describedApplicationIsTypical
            ? "yes"
            : "no",
      participantExplanation: orEmpty(ledger.comparison.participantExplanation),
    },
    reportPriority: ledger.reportPriority ? [ledger.reportPriority] : [],
    conflicts: ledger.conflicts,
  };
}
