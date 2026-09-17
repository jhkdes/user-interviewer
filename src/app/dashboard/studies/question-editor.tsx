"use client";

import type { PreInterviewQuestion } from "@/domain";

const EMPTY_QUESTION: Omit<PreInterviewQuestion, "id"> = {
  label: "",
  type: "single",
  options: ["", ""],
  allowOther: false,
};

/**
 * Editable list of a study's pre-interview screener questions — used both
 * by the "New Study" wizard's review step (pre-filled from the AI draft)
 * and the post-creation "Edit questions" page, so a study's questions can
 * be fixed up or regenerated any time, not just at creation.
 */
export function QuestionEditor({
  questions,
  onChange,
}: {
  questions: PreInterviewQuestion[];
  onChange: (questions: PreInterviewQuestion[]) => void;
}) {
  function updateQuestion(index: number, patch: Partial<PreInterviewQuestion>) {
    onChange(questions.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    const question = questions[questionIndex];
    const options = question.options.map((o, i) => (i === optionIndex ? value : o));
    updateQuestion(questionIndex, { options });
  }

  function addOption(questionIndex: number) {
    const question = questions[questionIndex];
    updateQuestion(questionIndex, { options: [...question.options, ""] });
  }

  function removeOption(questionIndex: number, optionIndex: number) {
    const question = questions[questionIndex];
    updateQuestion(questionIndex, {
      options: question.options.filter((_, i) => i !== optionIndex),
    });
  }

  function addQuestion() {
    onChange([...questions, { id: crypto.randomUUID(), ...EMPTY_QUESTION }]);
  }

  function removeQuestion(index: number) {
    onChange(questions.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      {questions.map((question, qIndex) => (
        <div
          key={question.id}
          className="space-y-2 rounded border border-neutral-300 p-3 dark:border-neutral-700"
        >
          <div className="flex items-start gap-2">
            <input
              type="text"
              placeholder="Question text"
              value={question.label}
              onChange={(e) => updateQuestion(qIndex, { label: e.target.value })}
              className="block w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            />
            <button
              type="button"
              onClick={() => removeQuestion(qIndex)}
              className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400"
            >
              Remove
            </button>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={`type-${question.id}`}
                checked={question.type === "single"}
                onChange={() => updateQuestion(qIndex, { type: "single" })}
              />
              Single-select
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name={`type-${question.id}`}
                checked={question.type === "multi"}
                onChange={() => updateQuestion(qIndex, { type: "multi" })}
              />
              Multi-select
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={question.allowOther ?? false}
                onChange={(e) => updateQuestion(qIndex, { allowOther: e.target.checked })}
              />
              Allow &quot;Other&quot;
            </label>
          </div>

          <div className="space-y-1 pl-2">
            {question.options.map((option, oIndex) => (
              <div key={oIndex} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Option ${oIndex + 1}`}
                  value={option}
                  onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                  className="block w-full rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                />
                <button
                  type="button"
                  onClick={() => removeOption(qIndex, oIndex)}
                  className="shrink-0 text-xs text-neutral-500 hover:underline dark:text-neutral-400"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addOption(qIndex)}
              className="text-xs text-neutral-500 hover:underline dark:text-neutral-400"
            >
              + Add option
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addQuestion}
        className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        + Add question
      </button>
    </div>
  );
}
