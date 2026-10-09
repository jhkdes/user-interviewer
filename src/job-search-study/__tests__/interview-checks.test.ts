import { describe, expect, it } from "vitest";
import type { InterviewTurn } from "@/llm";
import {
  estimateSpokenSeconds,
  askedPostingAge,
  askedSupportProvider,
  needsSupportProviderQuestion,
  findCoachingViolations,
  findEvaluativeAcknowledgments,
  findReportPriorityQuestion,
  findRepeatedScreenerQuestions,
  runInterviewChecks,
} from "../interview-checks";

const interviewer = (text: string): InterviewTurn => ({ speaker: "interviewer", text });
const participant = (text: string): InterviewTurn => ({ speaker: "participant", text });

describe("estimateSpokenSeconds", () => {
  it("estimates about 2.5 words per second", () => {
    expect(estimateSpokenSeconds("one two three four five")).toBe(2);
  });

  it("is zero for empty text", () => {
    expect(estimateSpokenSeconds("   ")).toBe(0);
  });
});

describe("findCoachingViolations", () => {
  it("flags advice and scoring language from the interviewer", () => {
    const turns = [
      interviewer("Walk me through your last application."),
      participant("I applied to forty jobs."),
      interviewer("You should probably apply to fewer roles."),
    ];

    expect(findCoachingViolations(turns)).toEqual([{ turnIndex: 2, phrase: "you should" }]);
  });

  it("ignores the same phrases when the participant says them", () => {
    expect(findCoachingViolations([participant("I think I should try harder.")])).toEqual([]);
  });
});

describe("findEvaluativeAcknowledgments", () => {
  it("flags interviewer acknowledgments that judge the participant's choices", () => {
    const turns = [
      participant("I stopped using the auto-apply tool."),
      interviewer("Good to know. That's a clear reason to step away from it."),
    ];

    expect(findEvaluativeAcknowledgments(turns)).toEqual([
      { turnIndex: 1, phrase: "good to know" },
      { turnIndex: 1, phrase: "clear reason" },
    ]);
  });

  it("accepts content-neutral acknowledgments", () => {
    expect(findEvaluativeAcknowledgments([interviewer("Got it. And what happened next?")])).toEqual(
      [],
    );
  });
});

describe("findRepeatedScreenerQuestions", () => {
  it("flags re-asking the search duration", () => {
    const turns = [interviewer("How long have you been actively searching?")];

    expect(findRepeatedScreenerQuestions(turns)).toEqual([
      { turnIndex: 0, screenerId: "search_duration" },
    ]);
  });

  it("does not flag the last-20-applications adherence question", () => {
    const turns = [
      interviewer(
        "Think about your last 20 or so applications. Roughly how many matched most of what you just described?",
      ),
    ];

    expect(findRepeatedScreenerQuestions(turns)).toEqual([]);
  });

  it("does not flag asking where interviews came from", () => {
    const turns = [
      interviewer(
        "Across all the recruiter conversations and interviews you have had, where have they mostly come from?",
      ),
    ];

    expect(findRepeatedScreenerQuestions(turns)).toEqual([]);
  });
});

describe("findReportPriorityQuestion", () => {
  it("returns null when the question was never asked", () => {
    expect(findReportPriorityQuestion([interviewer("Tell me about your target.")])).toBeNull();
  });

  it("recognizes a paraphrase of the question", () => {
    const question = interviewer(
      "Given that, what's one thing you'd most want help figuring out from this whole conversation?",
    );

    expect(findReportPriorityQuestion([question])).toEqual({ turnIndex: 0, answered: false });
  });

  it("does not mistake other questions for it", () => {
    expect(
      findReportPriorityQuestion([interviewer("Have you figured out where your time goes?")]),
    ).toBeNull();
  });

  it("reports whether the participant answered it", () => {
    const question = interviewer(
      "If this interview could give you useful guidance on one part of your job search, what would you most want help figuring out?",
    );

    expect(findReportPriorityQuestion([question])).toEqual({ turnIndex: 0, answered: false });
    expect(findReportPriorityQuestion([question, participant("Networking.")])).toEqual({
      turnIndex: 0,
      answered: true,
    });
  });
});

describe("askedPostingAge", () => {
  it("recognizes the posting-age probe", () => {
    expect(
      askedPostingAge([
        interviewer(
          "How did you come across that role, and about how long had it been posted when you applied?",
        ),
      ]),
    ).toBe(true);
    expect(askedPostingAge([interviewer("How old was the posting when you applied?")])).toBe(true);
  });

  it("does not mistake other questions for it", () => {
    expect(askedPostingAge([interviewer("How long did that application take you?")])).toBe(false);
    expect(askedPostingAge([participant("It had been posted a week.")])).toBe(false);
  });
});

describe("support provider question", () => {
  const outplacement = { search_support: ["Outplacement support paid for by a former employer"] };
  const freeProgram = {
    search_support: ["A free program (for example, a workforce, alumni, or community program)"],
  };

  it("is required for outplacement and free programs only", () => {
    expect(needsSupportProviderQuestion(outplacement)).toBe(true);
    expect(needsSupportProviderQuestion(freeProgram)).toBe(true);
    expect(needsSupportProviderQuestion({ search_support: ["A paid career coach"] })).toBe(false);
    expect(needsSupportProviderQuestion({ search_support: ["No support"] })).toBe(false);
    expect(
      needsSupportProviderQuestion({
        search_support: "Outplacement support paid for by a former employer",
      }),
    ).toBe(true);
    expect(needsSupportProviderQuestion(null)).toBe(false);
    expect(needsSupportProviderQuestion({})).toBe(false);
  });

  it("recognizes the wording the prompt uses, and not unrelated questions", () => {
    for (const text of [
      "Which outplacement provider is that, if you are comfortable saying?",
      "Which program is that, if you are comfortable saying?",
      "Who is your coach, or what firm are they with, if you are comfortable saying?",
      "Who is that with?",
    ]) {
      expect(askedSupportProvider([interviewer(text)]), text).toBe(true);
    }
    expect(askedSupportProvider([interviewer("Which roles did you apply to last week?")])).toBe(
      false,
    );
    expect(askedSupportProvider([participant("My outplacement provider is Acme.")])).toBe(false);
  });

  it("is flagged missing only when required and never asked", () => {
    const asked = [
      interviewer("Which outplacement provider is that, if you are comfortable saying?"),
    ];

    expect(
      runInterviewChecks([interviewer("Hello?")], 10, outplacement).supportProviderMissing,
    ).toBe(true);
    expect(runInterviewChecks(asked, 10, outplacement).supportProviderMissing).toBe(false);
    expect(
      runInterviewChecks([interviewer("Hello?")], 10, { search_support: ["No support"] })
        .supportProviderMissing,
    ).toBe(false);
    expect(runInterviewChecks([interviewer("Hello?")], 10).supportProviderMissing).toBe(false);
  });
});

describe("runInterviewChecks", () => {
  it("summarizes turns, duration, and closing shape", () => {
    const turns = [
      interviewer("Warm-up question?"),
      participant("Doing fine."),
      interviewer("Thanks so much for sharing all of that."),
    ];

    expect(runInterviewChecks(turns, 305)).toMatchObject({
      participantTurns: 1,
      interviewerTurns: 2,
      estimatedMinutes: 5.1,
      closesWithStatement: true,
      coachingViolations: [],
      evaluativeAcknowledgments: [],
      screenerReasks: [],
      reportPriority: null,
      postingAgeAsked: false,
      supportProviderMissing: false,
    });
  });

  it("flags a closing turn that asks a question", () => {
    expect(runInterviewChecks([interviewer("Anything else?")], 10).closesWithStatement).toBe(false);
  });
});
