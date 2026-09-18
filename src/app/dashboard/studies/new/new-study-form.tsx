"use client";

import { useState } from "react";
import Link from "next/link";
import type { PreInterviewQuestion, Study, StudyType } from "@/domain";
import { FeedbackQuestionListEditor } from "../feedback-question-list-editor";
import { QuestionEditor } from "../question-editor";
import { StudyLink } from "../../study-link";

type Step = "type" | "details" | "questions";

export function NewStudyForm() {
  const [step, setStep] = useState<Step>("type");
  const [type, setType] = useState<StudyType>("discovery");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [researchTopic, setResearchTopic] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [voiceProvider, setVoiceProvider] = useState<"vapi" | "elevenlabs">("vapi");
  const [questions, setQuestions] = useState<PreInterviewQuestion[]>([]);
  const [feedbackQuestions, setFeedbackQuestions] = useState<string[]>([""]);
  const [errors, setErrors] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Study | null>(null);

  function handleChooseType(chosen: StudyType) {
    setType(chosen);
    setStep("details");
  }

  async function handleGenerateQuestions(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim() || !description.trim()) {
      setErrors(["title and description are required"]);
      return;
    }

    if (type === "feedback") {
      setErrors([]);
      setStep("questions");
      return;
    }

    setErrors([]);
    setGenerating(true);
    const res = await fetch("/api/studies/draft-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), description: description.trim() }),
    });
    setGenerating(false);

    if (!res.ok) {
      setErrors(["Failed to generate questions. Please try again."]);
      return;
    }

    setQuestions((await res.json()) as PreInterviewQuestion[]);
    setStep("questions");
  }

  async function handleCreateStudy() {
    setErrors([]);
    setSubmitting(true);
    const res = await fetch("/api/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        title: title.trim(),
        description: description.trim(),
        ...(type === "feedback"
          ? { feedbackQuestions: feedbackQuestions.map((q) => q.trim()).filter(Boolean) }
          : { preInterviewQuestions: questions }),
        ...(researchTopic.trim() ? { researchTopic: researchTopic.trim() } : {}),
        ...(customPrompt.trim() ? { customPrompt: customPrompt.trim() } : {}),
        voiceProvider,
      }),
    });
    setSubmitting(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        fields?: string[];
      } | null;
      setErrors(body?.fields ?? [body?.error ?? "Failed to create study."]);
      return;
    }

    setCreated((await res.json()) as Study);
  }

  if (created) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Study created</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          Share this link with people matching the target profile:
        </p>
        <div className="mt-2">
          <StudyLink linkToken={created.linkToken} />
        </div>
        <Link href={`/dashboard/studies/${created.id}`} className="mt-6 inline-block underline">
          Go to study →
        </Link>
      </div>
    );
  }

  if (step === "type") {
    return (
      <div>
        <h1 className="text-xl font-semibold">New Study</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          What kind of study is this?
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleChooseType("discovery")}
            className="rounded border border-neutral-300 p-4 text-left hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            <div className="font-medium">Discovery</div>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              A 15-minute Mom Test-style interview exploring a broad topic — for open-ended
              product discovery, not a specific session.
            </p>
          </button>
          <button
            type="button"
            onClick={() => handleChooseType("feedback")}
            className="rounded border border-neutral-300 p-4 text-left hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            <div className="font-medium">Feedback</div>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              A quick 5-7 minute check-in working through a fixed list of questions — e.g.
              post-webinar or post-session feedback.
            </p>
          </button>
        </div>
      </div>
    );
  }

  if (step === "questions" && type === "feedback") {
    return (
      <div>
        <h1 className="text-xl font-semibold">Feedback questions</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          The list the interviewer will work through — order matters, but the interviewer will
          split, reorder, or skip based on time and how the conversation goes.
        </p>

        <div className="mt-6">
          <FeedbackQuestionListEditor questions={feedbackQuestions} onChange={setFeedbackQuestions} />
        </div>

        {errors.length > 0 && (
          <ul
            role="alert"
            className="mt-4 list-inside list-disc text-sm text-red-600 dark:text-red-400"
          >
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setStep("details")}
            className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleCreateStudy}
            disabled={submitting}
            className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {submitting ? "Creating…" : "Create study"}
          </button>
        </div>
      </div>
    );
  }

  if (step === "questions") {
    return (
      <div>
        <h1 className="text-xl font-semibold">Pre-interview questions</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          Drafted from your study details — edit, add, or remove questions before creating the
          study.
        </p>

        <div className="mt-6">
          <QuestionEditor questions={questions} onChange={setQuestions} />
        </div>

        {errors.length > 0 && (
          <ul
            role="alert"
            className="mt-4 list-inside list-disc text-sm text-red-600 dark:text-red-400"
          >
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setStep("details")}
            className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleGenerateQuestions}
            disabled={generating}
            className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            {generating ? "Regenerating…" : "Regenerate"}
          </button>
          <button
            type="button"
            onClick={handleCreateStudy}
            disabled={submitting}
            className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {submitting ? "Creating…" : "Create study"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">New {type === "feedback" ? "Feedback" : ""} Study</h1>
      <form onSubmit={handleGenerateQuestions} className="mt-6 space-y-4">
        <label className="block text-sm">
          Title
          <input
            type="text"
            placeholder="e.g. How Controllers Keep Financial Statements Clean"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="block text-sm">
          Description
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {type === "feedback"
              ? 'Completes: "A quick check-in about ..."'
              : 'Completes: "A 15-minute AI-run interview about ..."'}
          </p>
          <textarea
            placeholder={
              type === "feedback"
                ? "e.g. today's onboarding webinar"
                : "e.g. challenges in keeping financial statements clean and reconciled"
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        {type === "discovery" && (
          <label className="block text-sm">
            Research topic <span className="text-neutral-400">(optional)</span>
            <textarea
              placeholder="e.g. dig into where reconciliation breaks down, what tools they've tried, and where they're anxious about compliance"
              value={researchTopic}
              onChange={(e) => setResearchTopic(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
        )}

        <label className="block text-sm">
          Custom interview prompt <span className="text-neutral-400">(advanced, optional)</span>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Full control over interviewing strategy. If set, this replaces the generated prompt
            entirely for this study. Supports <code>{"{{participant_name}}"}</code> placeholders.
          </p>
          <textarea
            placeholder="Paste a full custom system prompt here..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={8}
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>

        <label className="block text-sm">
          Voice interviewer platform
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Which platform runs this study&apos;s interview calls — lets us A/B test platforms
            across studies.
          </p>
          <select
            value={voiceProvider}
            onChange={(e) => setVoiceProvider(e.target.value as "vapi" | "elevenlabs")}
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="vapi">Vapi</option>
            <option value="elevenlabs">ElevenLabs</option>
          </select>
        </label>

        {errors.length > 0 && (
          <ul role="alert" className="list-inside list-disc text-sm text-red-600 dark:text-red-400">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep("type")}
            className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={generating}
            className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {generating
              ? "Generating…"
              : type === "feedback"
                ? "Next: feedback questions"
                : "Generate questions"}
          </button>
        </div>
      </form>
    </div>
  );
}
