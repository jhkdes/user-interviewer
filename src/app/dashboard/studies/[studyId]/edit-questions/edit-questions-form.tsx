"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PreInterviewQuestion } from "@/domain";
import { QuestionEditor } from "../../question-editor";

export function EditQuestionsForm({
  studyId,
  title: initialTitle,
  description: initialDescription,
  initialQuestions,
  researchTopic: initialResearchTopic,
  customPrompt: initialCustomPrompt,
}: {
  studyId: string;
  title: string;
  description: string;
  initialQuestions: PreInterviewQuestion[];
  researchTopic: string | null;
  customPrompt: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [questions, setQuestions] = useState<PreInterviewQuestion[]>(initialQuestions);
  const [researchTopic, setResearchTopic] = useState(initialResearchTopic ?? "");
  const [customPrompt, setCustomPrompt] = useState(initialCustomPrompt ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleRegenerate() {
    if (!title.trim() || !description.trim()) {
      setErrors(["title and description are required to regenerate questions"]);
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
  }

  async function handleSave() {
    setErrors([]);
    setSaving(true);
    const res = await fetch(`/api/studies/${studyId}/questions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim(),
        preInterviewQuestions: questions,
        researchTopic: researchTopic.trim() ? researchTopic.trim() : null,
        customPrompt: customPrompt.trim() ? customPrompt.trim() : null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        fields?: string[];
      } | null;
      setErrors(body?.fields ?? [body?.error ?? "Failed to save questions."]);
      return;
    }

    router.push(`/dashboard/studies/${studyId}`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <label className="block text-sm">
        Description
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Completes: &ldquo;A 15-minute AI-run interview about ...&rdquo;
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

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

      <label className="block text-sm">
        Custom interview prompt <span className="text-neutral-400">(advanced, optional)</span>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Full control over interviewing strategy. If set, this replaces the research topic above
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

      <QuestionEditor questions={questions} onChange={setQuestions} />

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
          onClick={handleRegenerate}
          disabled={generating}
          className="rounded border border-neutral-300 px-4 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
        >
          {generating ? "Generating…" : "Regenerate from title/description"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
