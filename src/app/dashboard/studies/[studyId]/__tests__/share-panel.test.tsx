// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharePanel } from "../share-panel";

afterEach(cleanup);

const ACTIVE = { userId: "u1", email: "active@example.com", status: "active" };
const INVITED = { userId: "u2", email: "invited@example.com", status: "invited" };

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
let viewers: unknown[];
let handler: Handler;
const fetchMock = vi.fn();

const ok = (body?: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

beforeEach(() => {
  viewers = [ACTIVE, INVITED];
  handler = () => ok();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url === "/api/studies/s1/viewers" && (init?.method ?? "GET") === "GET") {
      return ok({ viewers });
    }
    return handler(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
  window.confirm = vi.fn().mockReturnValue(true);
});

const callsTo = (method: string) =>
  fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method);

describe("SharePanel", () => {
  it("lists who has access, with their status", async () => {
    render(<SharePanel studyId="s1" />);

    expect(await screen.findByText("active@example.com")).toBeInTheDocument();
    expect(screen.getByText("invited@example.com")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Invited")).toBeInTheDocument();
  });

  it("offers Resend only for someone who has not accepted", async () => {
    render(<SharePanel studyId="s1" />);
    await screen.findByText("active@example.com");
    expect(screen.getAllByRole("button", { name: "Resend invite" })).toHaveLength(1);
  });

  it("says when no one has access yet", async () => {
    viewers = [];
    render(<SharePanel studyId="s1" />);
    expect(await screen.findByText("No one has access yet.")).toBeInTheDocument();
  });

  it("invites by email, reports the result, and refreshes the list", async () => {
    viewers = [];
    handler = (_url, init) => {
      if (init?.method === "POST") {
        viewers = [INVITED];
        return ok({ outcome: "invited" });
      }
      return ok();
    };
    render(<SharePanel studyId="s1" />);
    await screen.findByText("No one has access yet.");

    fireEvent.change(screen.getByLabelText("Email address to invite"), {
      target: { value: "invited@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Invite sent.");
    expect(await screen.findByText("invited@example.com")).toBeInTheDocument();
    expect(JSON.parse(callsTo("POST")[0][1].body)).toEqual({ email: "invited@example.com" });
  });

  it("tells the admin when no email was sent because the person already has an account", async () => {
    handler = () => ok({ outcome: "access-added" });
    render(<SharePanel studyId="s1" />);
    await screen.findByText("active@example.com");

    fireEvent.change(screen.getByLabelText("Email address to invite"), {
      target: { value: "active@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/no email was sent/i);
  });

  it("shows the server's message when an invite is refused", async () => {
    handler = () => ok({ error: "boss@example.com is an admin and already has full access" }, 409);
    render(<SharePanel studyId="s1" />);
    await screen.findByText("active@example.com");

    fireEvent.change(screen.getByLabelText("Email address to invite"), {
      target: { value: "boss@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/is an admin/);
  });

  it("removes a viewer from the study after confirming", async () => {
    render(<SharePanel studyId="s1" />);
    await screen.findByText("active@example.com");

    fireEvent.click(screen.getAllByRole("button", { name: "Remove from study" })[0]);

    await waitFor(() => expect(callsTo("DELETE")).toHaveLength(1));
    expect(callsTo("DELETE")[0][0]).toBe("/api/studies/s1/viewers/u1");
  });

  it("does nothing when the admin cancels the confirmation", async () => {
    window.confirm = vi.fn().mockReturnValue(false);
    render(<SharePanel studyId="s1" />);
    await screen.findByText("active@example.com");

    fireEvent.click(screen.getAllByRole("button", { name: "Remove from study" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete account" })[0]);

    expect(callsTo("DELETE")).toHaveLength(0);
  });

  it("deletes the account with scope=account, after warning that it covers every study", async () => {
    render(<SharePanel studyId="s1" />);
    await screen.findByText("active@example.com");

    fireEvent.click(screen.getAllByRole("button", { name: "Delete account" })[0]);

    await waitFor(() => expect(callsTo("DELETE")).toHaveLength(1));
    expect(callsTo("DELETE")[0][0]).toBe("/api/studies/s1/viewers/u1?scope=account");
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/every study/));
  });

  it("resends an invite", async () => {
    render(<SharePanel studyId="s1" />);
    await screen.findByText("invited@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Resend invite" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /new invite to invited@example.com/,
    );
    expect(callsTo("POST")[0][0]).toBe("/api/studies/s1/viewers/u2/resend");
  });
});
