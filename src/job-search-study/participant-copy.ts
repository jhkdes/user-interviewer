import type { ParticipantCopy } from "@/domain/participant-copy";

/**
 * The landing and ending page wording for the job-search study. It leads with
 * the free personalized report, and says plainly when it arrives, who sends it,
 * that it depends on a completed interview, and to check the spam folder.
 * The consent note is left at the default for now (the privacy wording is
 * still to be decided).
 */
export const JOB_SEARCH_PARTICIPANT_COPY: ParticipantCopy = {
  intro: {
    tagline:
      "A 15-minute AI-run conversation about how you're searching for your next job. Finish it and get a free personalized job search report.",
    facts: [
      "~15 minutes",
      "Free personalized report",
      "Voice, not text",
      "No login",
      "Confidential",
    ],
    steps: [
      {
        title: "Click the link",
        body: "No signup, just your name and a few quick questions about your search.",
      },
      {
        title: "Talk with an AI",
        body: "A real conversation of about 15 minutes about how you search for jobs and what leads to interviews. It's not a script.",
      },
      {
        title: "Speak freely",
        body: "Your answers are confidential, and quotes are never attributed to you.",
      },
      {
        title: "Get your free report",
        body: "Within a day, your personalized job search report arrives by email from jkim@discoverfirst.co. Check your spam folder if you don't see it. Reports are made for completed interviews, so plan to stay through the whole conversation.",
      },
    ],
  },
  completion: {
    message:
      "Your free personalized job search report will arrive by email within a day, from jkim@discoverfirst.co. If you don't see it, check your spam folder. We can only make a report from a completed interview, so if yours ended early, you may not receive one.",
  },
};

/**
 * The job-search study's wording for its text link: the same offer and the same
 * promises as the voice wording, said for a typed chat. The ending is the same
 * (nothing in it is about talking), and the consent note stays at the typed
 * default (no audio; the conversation is saved as a transcript).
 */
export const JOB_SEARCH_TEXT_PARTICIPANT_COPY: ParticipantCopy = {
  intro: {
    tagline:
      "A 15-minute AI-run written conversation about how you're searching for your next job. Finish it and get a free personalized job search report.",
    facts: [
      "~15 minutes",
      "Free personalized report",
      "Typed chat, not voice",
      "No login",
      "Confidential",
    ],
    steps: [
      {
        title: "Click the link",
        body: "No signup, just your name and a few quick questions about your search.",
      },
      {
        title: "Chat with an AI",
        body: "A real written conversation of about 15 minutes about how you search for jobs and what leads to interviews. You type, it replies. It's not a script.",
      },
      {
        title: "Share freely",
        body: "Your answers are confidential, and quotes are never attributed to you.",
      },
      JOB_SEARCH_PARTICIPANT_COPY.intro!.steps![3],
    ],
  },
  completion: JOB_SEARCH_PARTICIPANT_COPY.completion,
};
