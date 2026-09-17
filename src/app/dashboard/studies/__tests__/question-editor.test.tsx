// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreInterviewQuestion } from "@/domain";
import { QuestionEditor } from "../question-editor";

const sampleQuestions: PreInterviewQuestion[] = [
  {
    id: "role",
    label: "What's your current role?",
    type: "single",
    options: ["Controller", "Assistant Controller"],
    allowOther: true,
  },
];

afterEach(() => {
  cleanup();
});

describe("QuestionEditor", () => {
  it("renders each question's label, options, and allowOther state", () => {
    render(<QuestionEditor questions={sampleQuestions} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("What's your current role?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Controller")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Assistant Controller")).toBeInTheDocument();
    expect(screen.getByLabelText('Allow "Other"')).toBeChecked();
  });

  it("calls onChange with an updated label when edited", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<QuestionEditor questions={sampleQuestions} onChange={onChange} />);

    await user.type(screen.getByDisplayValue("What's your current role?"), "!");

    expect(onChange).toHaveBeenCalledWith([
      { ...sampleQuestions[0], label: "What's your current role?!" },
    ]);
  });

  it("adds a new blank question when 'Add question' is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<QuestionEditor questions={sampleQuestions} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Add question" }));

    expect(onChange).toHaveBeenCalledWith([
      sampleQuestions[0],
      expect.objectContaining({ label: "", type: "single", options: ["", ""] }),
    ]);
  });

  it("removes a question when 'Remove' is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<QuestionEditor questions={sampleQuestions} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("adds a blank option to a question when 'Add option' is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<QuestionEditor questions={sampleQuestions} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Add option" }));

    expect(onChange).toHaveBeenCalledWith([
      { ...sampleQuestions[0], options: ["Controller", "Assistant Controller", ""] },
    ]);
  });
});
