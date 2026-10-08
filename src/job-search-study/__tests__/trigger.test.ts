import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerReportSweep } from "../pipeline/trigger";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("triggerReportSweep", () => {
  it("calls the sweep route with the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("APP_BASE_URL", "https://app.example.com/");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await triggerReportSweep();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://app.example.com/api/internal/job-search-reports/sweep");
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer s3cret");
  });

  it("does nothing, with a warning, when it is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("APP_BASE_URL", "");
    vi.stubEnv("VERCEL_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await triggerReportSweep();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("swallows a timeout or network failure", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("APP_BASE_URL", "https://app.example.com");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timed out")));

    await expect(triggerReportSweep()).resolves.toBeUndefined();
  });
});
