/**
 * A participant's answers to the study's pre-interview questions, shown under
 * the interview's date line on the admin and viewer interview pages. Works
 * from just a question's id and label, so both pages can use it.
 *
 * Questions come first in the study's order. An answer whose question has
 * since been removed from the study is still shown, under a placeholder label,
 * rather than silently dropped. Renders nothing when there are no answers.
 */
export function ScreenerAnswers({
  questions,
  answers,
}: {
  questions: { id: string; label: string }[];
  answers: Record<string, string | string[]> | null;
}) {
  if (!answers) return null;

  const labelFor = new Map(questions.map((q) => [q.id, q.label]));
  const orderedIds = [
    ...questions.map((q) => q.id).filter((id) => id in answers),
    ...Object.keys(answers).filter((id) => !labelFor.has(id)),
  ];
  const rows = orderedIds
    .map((id) => ({
      id,
      label: labelFor.get(id) ?? "(question no longer in this study)",
      answer: [answers[id]]
        .flat()
        .filter((a) => a.trim() !== "")
        .join(", "),
    }))
    .filter((row) => row.answer !== "");
  if (rows.length === 0) return null;

  return (
    <section className="mt-3">
      <h2 className="text-sm font-semibold">Pre-interview answers</h2>
      <dl className="mt-1 space-y-1 text-sm">
        {rows.map((row) => (
          <div key={row.id}>
            <dt className="text-neutral-500 dark:text-neutral-400">{row.label}</dt>
            <dd>{row.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
