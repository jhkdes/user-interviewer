import type { ReactNode } from "react";
import { BackLink } from "./back-link";

const DISCOVERFIRST_URL = "https://discoverfirst.co";
const CONTACT_EMAIL = "jkim@discoverfirst.co";

const LINK_CLASS = "font-semibold underline hover:no-underline";

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "Who is running this study?",
    a: (
      <>
        <a href={DISCOVERFIRST_URL} className={LINK_CLASS}>
          discoverFirst.co
        </a>
        , an independent research effort — not affiliated with your employer or with any AI vendor
        whose tools might come up in the conversation.
      </>
    ),
  },
  {
    q: "What happens to what I say?",
    a: "Your interview is recorded and transcribed so we can review it afterward. Nothing you say goes back to your employer, and it isn't shared with any AI vendor whose tools you mention.",
  },
  {
    q: "Will I be identified in anything public?",
    a: "No. Any quotes used publicly are anonymized to role and industry only — never your name or company.",
  },
  {
    q: "Who actually interviews me?",
    a: "An AI interviewer conducts the live voice conversation. A person reviews the transcripts and recordings afterward.",
  },
  {
    q: "Do I need to sign up for anything?",
    a: "No account or login — just your first name and email so we can follow up with what we learn.",
  },
  {
    q: "What do I get out of it?",
    a: "A short summary of your own conversation afterward, and access to the full study report once it's done.",
  },
  {
    q: "Who do I contact with questions?",
    a: (
      <a href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASS}>
        {CONTACT_EMAIL}
      </a>
    ),
  },
];

export default function InterviewFaqPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <BackLink />
      <h1 className="mt-2 text-2xl font-semibold">Frequently asked questions</h1>
      <dl className="mt-6 space-y-5">
        {FAQS.map(({ q, a }) => (
          <div key={q}>
            <dt className="text-sm font-semibold">{q}</dt>
            <dd className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{a}</dd>
          </div>
        ))}
      </dl>
    </main>
  );
}
