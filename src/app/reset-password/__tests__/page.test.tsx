// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ updateUser: vi.fn(), push: vi.fn(), refresh: vi.fn() }));

vi.mock("@/lib/supabase/browser-client", () => ({
  createBrowserSupabaseClient: () => ({ auth: { updateUser: mocks.updateUser } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import ResetPasswordPage from "../page";

afterEach(cleanup);

function submit(password: string) {
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Set password" }));
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.updateUser.mockResolvedValue({ error: null });
  });

  it("shows a bordered field and a solid button, not bare controls", () => {
    render(<ResetPasswordPage />);

    const field = screen.getByLabelText("New password");
    expect(field).toHaveClass("border", "rounded-md");
    expect(field).toHaveAttribute("autocomplete", "new-password");
    const button = screen.getByRole("button", { name: "Set password" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("bg-neutral-900", "w-full");
    expect(screen.getByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
  });

  it("sets the password and goes to the dashboard", async () => {
    render(<ResetPasswordPage />);
    submit("a-brand-new-password");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "a-brand-new-password" });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("shows the error and stays on the page when the password is refused", async () => {
    mocks.updateUser.mockResolvedValue({
      error: { message: "New password should be different from the old password." },
    });
    render(<ResetPasswordPage />);
    submit("same-as-before");

    expect(await screen.findByRole("alert")).toHaveTextContent(/should be different/);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Set password" })).toBeEnabled();
  });
});
