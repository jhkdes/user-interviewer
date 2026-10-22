// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/browser-client", () => ({
  createBrowserSupabaseClient: () => ({
    auth: { verifyOtp: mocks.verifyOtp, updateUser: mocks.updateUser },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { AcceptInviteForm } from "../accept-invite-form";

afterEach(cleanup);

function submit(password: string) {
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /set password/i }));
}

describe("AcceptInviteForm", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.verifyOtp.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
  });

  it("does not check the token until the form is submitted", () => {
    render(<AcceptInviteForm tokenHash="tok" />);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("checks the token, sets the password, then goes to the viewer pages", async () => {
    render(<AcceptInviteForm tokenHash="tok" />);
    submit("a-good-password");

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/viewer"));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "invite", token_hash: "tok" });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "a-good-password" });
    expect(mocks.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateUser.mock.invocationCallOrder[0],
    );
  });

  it("explains an invalid or expired link, and does not set a password", async () => {
    mocks.verifyOtp.mockResolvedValue({
      error: { message: "Email link is invalid or has expired" },
    });
    render(<AcceptInviteForm tokenHash="tok" />);
    submit("a-good-password");

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or has expired/i);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("lets the person retry a refused password without checking the one-time token again", async () => {
    mocks.updateUser
      .mockResolvedValueOnce({ error: { message: "Password should be at least 6 characters" } })
      .mockResolvedValueOnce({ error: null });
    render(<AcceptInviteForm tokenHash="tok" />);

    submit("short");
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least 6/);

    submit("a-much-longer-password");
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/viewer"));
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.updateUser).toHaveBeenCalledTimes(2);
  });
});
