// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resetPasswordForEmail: vi.fn() }));

vi.mock("@/lib/supabase/browser-client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  }),
}));

import ForgotPasswordPage from "../page";

afterEach(cleanup);

function submit(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("shows a bordered field and a solid button, not bare controls", () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByLabelText("Email")).toHaveClass("border", "rounded-md");
    const button = screen.getByRole("button", { name: "Send reset link" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("bg-neutral-900", "w-full");
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
  });

  it("links back to the login page", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("link", { name: "Back to log in" })).toHaveAttribute("href", "/login");
  });

  it("asks for the reset email and points the link at the reset page", async () => {
    render(<ForgotPasswordPage />);
    submit("pm@example.com");

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("pm@example.com", {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
  });

  it("does not reveal whether the account exists, and offers the way back", async () => {
    render(<ForgotPasswordPage />);
    submit("pm@example.com");

    expect(
      await screen.findByText(/If an account exists for pm@example.com, a password reset link/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to log in" })).toHaveAttribute("href", "/login");
  });

  it("shows the error and keeps the form when the request fails", async () => {
    mocks.resetPasswordForEmail.mockResolvedValue({ error: { message: "Rate limit exceeded" } });
    render(<ForgotPasswordPage />);
    submit("pm@example.com");

    expect(await screen.findByRole("alert")).toHaveTextContent("Rate limit exceeded");
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeEnabled();
  });
});
