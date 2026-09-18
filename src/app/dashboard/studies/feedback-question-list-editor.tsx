"use client";

/**
 * Editable, ordered list of a feedback-type study's plain-text questions
 * (FEEDBACK_STUDY_TYPE.md decision 5) — manually authored by the PM, not
 * AI-drafted, so this is deliberately much simpler than `QuestionEditor`:
 * no type/options/allowOther, just label text plus reorder/add/remove. Used
 * both by the "New Study" wizard's feedback path and the post-creation
 * "Edit questions" page.
 */
export function FeedbackQuestionListEditor({
  questions,
  onChange,
}: {
  questions: string[];
  onChange: (questions: string[]) => void;
}) {
  function updateQuestion(index: number, value: string) {
    onChange(questions.map((q, i) => (i === index ? value : q)));
  }

  function addQuestion() {
    onChange([...questions, ""]);
  }

  function removeQuestion(index: number) {
    onChange(questions.filter((_, i) => i !== index));
  }

  function moveQuestion(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {questions.map((question, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-right text-xs text-neutral-400">{index + 1}.</span>
          <input
            type="text"
            placeholder="e.g. What did you think of the content and pacing?"
            value={question}
            onChange={(e) => updateQuestion(index, e.target.value)}
            className="block w-full rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            onClick={() => moveQuestion(index, -1)}
            disabled={index === 0}
            aria-label="Move up"
            className="shrink-0 text-xs text-neutral-500 hover:underline disabled:opacity-30 disabled:hover:no-underline dark:text-neutral-400"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => moveQuestion(index, 1)}
            disabled={index === questions.length - 1}
            aria-label="Move down"
            className="shrink-0 text-xs text-neutral-500 hover:underline disabled:opacity-30 disabled:hover:no-underline dark:text-neutral-400"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={() => removeQuestion(index)}
            className="shrink-0 text-xs text-red-600 hover:underline dark:text-red-400"
          >
            Remove
          </button>
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
