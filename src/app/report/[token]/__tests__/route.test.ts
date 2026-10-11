import { afterEach, describe, expect, it, vi } from "vitest";
import { releaseReport, withdrawReport } from "@/job-search-study/pipeline/review-actions";
import { runSweep } from "@/job-search-study/pipeline/sweep";
import { setup } from "@/job-search-study/__tests__/pipeline-helpers";

const getRepo = vi.fn();
vi.mock("@/job-search-study/storage/get-report-repository", () => ({
  getJobSearchReportRepository: () => getRepo(),
}));

const getInterviews = vi.fn();
vi.mock("@/repositories/get-interview-repository", () => ({
  getInterviewRepository: () => getInterviews(),
}));

import { GET } from "../route";

afterEach(() => {
  getRepo.mockReset();
  getInterviews.mockReset();
});

const call = (token: string) =>
  GET(new Request(`http://localhost/report/${token}`), { params: { token } });

async function releasedReport() {
  const f = await setup();
  await f.addInterview(8, "Jordan");
  const { processed } = await runSweep(f.deps);
  const { report } = await releaseReport(f.reviewDeps, processed!.reportId, {
    releasedBy: "pm@example.com",
  });
  getRepo.mockReturnValue(f.reportRepo);
  getInterviews.mockReturnValue(f.interviewRepo);
  return { f, report };
}

describe("GET /report/[token]", () => {
  it("serves a released report as private, non-indexed HTML", async () => {
    const { report } = await releasedReport();

    const res = await call(report.accessToken!);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const html = await res.text();
    expect(html).toContain("Your Job Search Report");
    expect(html).toContain("Prepared for Jordan");
  });

  it("answers 404 for an unknown token", async () => {
    await releasedReport();

    const res = await call("not-a-real-token");

    expect(res.status).toBe(404);
    expect(await res.text()).toContain("isn't available");
  });

  it("answers 404 once the report is withdrawn", async () => {
    const { f, report } = await releasedReport();
    await withdrawReport(f.reviewDeps, report.id);

    expect((await call(report.accessToken!)).status).toBe(404);
  });
});
