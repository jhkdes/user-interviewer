// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScreenerAnswers } from "../screener-answers";

afterEach(cleanup);

const questions = [
  { id: "q1", label: "Team size?" },
  { id: "q2", label: "Which tools do you use?" },
];

describe("ScreenerAnswers", () => {
  it("shows each answer under its question's label, in the study's order", () => {
    const { container } = render(
      <ScreenerAnswers questions={questions} answers={{ q2: "Claude", q1: "6-20" }} />,
    );

    expect(screen.getByText("Pre-interview answers")).toBeInTheDocument();
    const labels = [...container.querySelectorAll("dt")].map((el) => el.textContent);
    expect(labels).toEqual(["Team size?", "Which tools do you use?"]);
    expect(screen.getByText("6-20")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("joins a multi-select answer", () => {
    render(
      <ScreenerAnswers
        questions={questions}
        answers={{ q2: ["Claude", "ChatGPT", "Other: Cursor"] }}
      />,
    );
    expect(screen.getByText("Claude, ChatGPT, Other: Cursor")).toBeInTheDocument();
  });

  it("skips questions the participant did not answer", () => {
    const { container } = render(<ScreenerAnswers questions={questions} answers={{ q1: "1-5" }} />);
    expect([...container.querySelectorAll("dt")].map((el) => el.textContent)).toEqual([
      "Team size?",
    ]);
  });

  it("still shows an answer whose question was removed from the study, after the others", () => {
    const { container } = render(
      <ScreenerAnswers questions={questions} answers={{ gone: "Old answer", q1: "1-5" }} />,
    );
    const labels = [...container.querySelectorAll("dt")].map((el) => el.textContent);
    expect(labels).toEqual(["Team size?", "(question no longer in this study)"]);
    expect(screen.getByText("Old answer")).toBeInTheDocument();
  });

  it("renders nothing when there are no answers", () => {
    const cases: Array<Record<string, string | string[]> | null> = [
      null,
      {},
      { q1: "" },
      { q1: [] },
      { q1: "   " },
    ];
    for (const answers of cases) {
      const { container } = render(<ScreenerAnswers questions={questions} answers={answers} />);
      expect(container).toBeEmptyDOMElement();
      cleanup();
    }
  });
});
