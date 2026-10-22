// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  redirectTo: null as string | null,
}));

vi.mock("@/lib/supabase/browser-client", () => ({
  createBrowserSupabaseClient: () => ({ auth: { signInWithPassword: mocks.signInWithPassword } }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => ({
    get: (key: string) => (key === "redirectTo" ? mocks.redirectTo : null),
  }),
}));

import { LoginForm } from "../login-form";

afterEach(cleanup);

function submit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

describe("LoginForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.redirectTo = null;
    mocks.signInWithPassword.mockResolvedValue({ error: null });
  });

  it("shows bordered fields and a solid button, not bare controls", () => {
    render(<LoginForm />);

    for (const label of ["Email", "Password"]) {
      expect(screen.getByLabelText(label)).toHaveClass("border", "rounded-md");
    }
    const button = screen.getByRole("button", { name: "Log in" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toHaveClass("bg-neutral-900", "w-full");
  });

  it("has a clear heading and a forgot-password link", () => {
    render(<LoginForm />);
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/forgot-password",
    );
  });

  it("lets the browser fill in saved credentials", () => {
    render(<LoginForm />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("signs in and goes to the dashboard by default", async () => {
    render(<LoginForm />);
    submit("pm@example.com", "secret-pw");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"));
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "pm@example.com",
      password: "secret-pw",
    });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("goes back to the page the person was trying to reach", async () => {
    mocks.redirectTo = "/viewer/studies/abc";
    render(<LoginForm />);
    submit("pm@example.com", "secret-pw");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/viewer/studies/abc"));
  });

  it("shows the error and stays on the page when sign-in fails", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    render(<LoginForm />);
    submit("pm@example.com", "wrong");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid login credentials");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Log in" })).toBeEnabled();
  });
});
