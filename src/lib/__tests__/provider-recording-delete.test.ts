import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteConversation } from "../elevenlabs/client";
import { deleteVapiCall } from "../vapi/client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("deleteVapiCall", () => {
  it("sends an authenticated DELETE for the call and reports success", async () => {
    vi.stubEnv("VAPI_API_KEY", "vapi-key");
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    expect(await deleteVapiCall("call/1")).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.vapi.ai/call/call%2F1");
    expect(init).toMatchObject({
      method: "DELETE",
      headers: { Authorization: "Bearer vapi-key" },
    });
  });

  it("reports failure, logging it, when the API refuses", async () => {
    vi.stubEnv("VAPI_API_KEY", "vapi-key");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    expect(await deleteVapiCall("call-1")).toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it("never throws when the request itself fails", async () => {
    vi.stubEnv("VAPI_API_KEY", "vapi-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    expect(await deleteVapiCall("call-1")).toBe(false);
  });

  it("does nothing without an API key", async () => {
    vi.stubEnv("VAPI_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await deleteVapiCall("call-1")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("deleteConversation", () => {
  it("sends an authenticated DELETE for the conversation and reports success", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-key");
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    expect(await deleteConversation("conv 1")).toBe(true);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/convai/conversations/conv%201");
    expect(init).toMatchObject({ method: "DELETE", headers: { "xi-api-key": "xi-key" } });
  });

  it("reports failure, logging it, when the API refuses", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-key");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 422 })));

    expect(await deleteConversation("conv-1")).toBe(false);
    expect(error).toHaveBeenCalled();
  });

  it("never throws when the request itself fails", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "xi-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    expect(await deleteConversation("conv-1")).toBe(false);
  });

  it("does nothing without an API key", async () => {
    vi.stubEnv("ELEVENLABS_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    expect(await deleteConversation("conv-1")).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
