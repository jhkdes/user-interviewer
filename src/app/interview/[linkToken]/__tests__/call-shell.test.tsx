// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CallShell } from "../call-shell";

afterEach(() => {
  cleanup();
});

describe("CallShell", () => {
  it("states the 15-minute duration for a discovery-type interview in progress", () => {
    render(
      <CallShell status="in-progress" errorMessage={null} elapsedSeconds={30} type="discovery" />,
    );

    expect(screen.getByText(/takes about 15 mins/)).toBeInTheDocument();
    expect(screen.queryByText(/takes about 5 mins/)).not.toBeInTheDocument();
  });

  it("states the 5-minute duration for a feedback-type call in progress, not 15", () => {
    render(
      <CallShell status="in-progress" errorMessage={null} elapsedSeconds={30} type="feedback" />,
    );

    expect(screen.getByText(/takes about 5 mins/)).toBeInTheDocument();
    expect(screen.queryByText(/takes about 15 mins/)).not.toBeInTheDocument();
  });

  it("shows no duration copy outside the in-progress status", () => {
    render(
      <CallShell status="connecting" errorMessage={null} elapsedSeconds={0} type="feedback" />,
    );

    expect(screen.queryByText(/takes about/)).not.toBeInTheDocument();
  });

  describe("the typing restart option", () => {
    const RESTART = /Restart with a typing interview/;
    const onRestartWithTyping = async () => true;

    it("is never shown unless it was offered, whatever the status", () => {
      for (const status of ["connecting", "starting", "in-progress", "error"] as const) {
        render(
          <CallShell status={status} errorMessage={null} elapsedSeconds={5} type="feedback" />,
        );
        expect(screen.queryByText(RESTART)).not.toBeInTheDocument();
        cleanup();
      }
    });

    it.each(["connecting", "starting"] as const)("is shown while the call is %s", (status) => {
      render(
        <CallShell
          status={status}
          errorMessage={null}
          elapsedSeconds={0}
          type="feedback"
          onRestartWithTyping={onRestartWithTyping}
        />,
      );

      expect(screen.getByText(RESTART)).toBeInTheDocument();
    });

    it("is shown for the first 30 seconds of the interview, then disappears", () => {
      const props = {
        status: "in-progress" as const,
        errorMessage: null,
        type: "feedback" as const,
        onRestartWithTyping,
      };

      const { rerender } = render(<CallShell {...props} elapsedSeconds={0} />);
      expect(screen.getByText(RESTART)).toBeInTheDocument();
      rerender(<CallShell {...props} elapsedSeconds={29} />);
      expect(screen.getByText(RESTART)).toBeInTheDocument();
      rerender(<CallShell {...props} elapsedSeconds={30} />);
      expect(screen.queryByText(RESTART)).not.toBeInTheDocument();
      rerender(<CallShell {...props} elapsedSeconds={400} />);
      expect(screen.queryByText(RESTART)).not.toBeInTheDocument();
    });

    it("is always shown on the error screen, however long the call ran", () => {
      render(
        <CallShell
          status="error"
          errorMessage="Permission denied"
          elapsedSeconds={400}
          type="feedback"
          onRestartWithTyping={onRestartWithTyping}
        />,
      );

      expect(screen.getByText(RESTART)).toBeInTheDocument();
      expect(screen.getByText("Permission denied")).toBeInTheDocument();
    });

    it("is not shown once the call has ended", () => {
      render(
        <CallShell
          status="ended"
          errorMessage={null}
          elapsedSeconds={10}
          type="feedback"
          onRestartWithTyping={onRestartWithTyping}
        />,
      );

      expect(screen.queryByText(RESTART)).not.toBeInTheDocument();
    });
  });

  describe("retrying after an error", () => {
    it("offers Try again on the error screen only when a retry was offered", () => {
      const { rerender } = render(
        <CallShell status="error" errorMessage="Oops" elapsedSeconds={0} type="feedback" />,
      );
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

      rerender(
        <CallShell
          status="error"
          errorMessage="Oops"
          elapsedSeconds={0}
          type="feedback"
          onRetry={() => {}}
        />,
      );
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });

    it("does not offer Try again when nothing went wrong", () => {
      render(
        <CallShell
          status="in-progress"
          errorMessage={null}
          elapsedSeconds={0}
          type="feedback"
          onRetry={() => {}}
        />,
      );

      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    });
  });
});
