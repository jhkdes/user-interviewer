// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeedbackQuestionListEditor } from "../feedback-question-list-editor";

const sampleQuestions = ["What did you think of the content?", "Would you recommend this?"];

afterEach(() => {
  cleanup();
});

describe("FeedbackQuestionListEditor", () => {
  it("renders each question's text", () => {
    render(<FeedbackQuestionListEditor questions={sampleQuestions} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("What did you think of the content?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Would you recommend this?")).toBeInTheDocument();
  });

  it("calls onChange with updated text when a question is edited", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FeedbackQuestionListEditor questions={sampleQuestions} onChange={onChange} />);

    await user.type(screen.getByDisplayValue("Would you recommend this?"), "?");

    expect(onChange).toHaveBeenCalledWith([sampleQuestions[0], "Would you recommend this??"]);
  });

  it("adds a new blank question when 'Add question' is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FeedbackQuestionListEditor questions={sampleQuestions} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Add question" }));

    expect(onChange).toHaveBeenCalledWith([...sampleQuestions, ""]);
  });

  it("removes a question when 'Remove' is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FeedbackQuestionListEditor questions={sampleQuestions} onChange={onChange} />);

    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);

    expect(onChange).toHaveBeenCalledWith([sampleQuestions[1]]);
  });

  it("reorders a question when 'Move down' then 'Move up' is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<FeedbackQuestionListEditor questions={sampleQuestions} onChange={onChange} />);

    await user.click(screen.getAllByRole("button", { name: "Move down" })[0]);

    expect(onChange).toHaveBeenCalledWith([sampleQuestions[1], sampleQuestions[0]]);
  });

  it("disables 'Move up' on the first question and 'Move down' on the last", () => {
    render(<FeedbackQuestionListEditor questions={sampleQuestions} onChange={vi.fn()} />);

    const upButtons = screen.getAllByRole("button", { name: "Move up" });
    const downButtons = screen.getAllByRole("button", { name: "Move down" });

    expect(upButtons[0]).toBeDisabled();
    expect(downButtons[downButtons.length - 1]).toBeDisabled();
  });
});
