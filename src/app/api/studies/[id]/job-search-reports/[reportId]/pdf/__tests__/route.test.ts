import { afterEach, describe, expect, it, vi } from "vitest";
import { setup } from "@/job-search-study/__tests__/pipeline-helpers";
import { runSweep } from "@/job-search-study/pipeline/sweep";

const getRepo = vi.fn();
vi.mock("@/job-search-study/storage/get-report-repository", () => ({
  getJobSearchReportRepository: () => getRepo(),
}));
const renderPdf = vi.fn();
vi.mock("@/job-search-study/report/render-pdf", () => ({
  renderReportPdf: (html: string) => renderPdf(html),
}));

import { GET } from "../route";

afterEach(() => {
  getRepo.mockReset();
  renderPdf.mockReset();
  vi.restoreAllMocks();
});

async function draft() {
  const f = await setup();
  await f.addInterview(8, "Jordan");
  const { processed } = await runSweep(f.deps);
  getRepo.mockReturnValue(f.reportRepo);
  return { f, reportId: processed!.reportId };
}

const call = (id: string, reportId: string) =>
  GET(new Request("http://localhost/pdf"), { params: { id, reportId } });

describe("GET /api/studies/[id]/job-search-reports/[reportId]/pdf", () => {
  it("returns the report as a PDF made from its HTML", async () => {
    const { f, reportId } = await draft();
    renderPdf.mockResolvedValue(Buffer.from("%PDF-1.4 test"));

    const res = await call(f.studyId, reportId);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("%PDF-1.4 test");
    expect(renderPdf.mock.calls[0][0]).toMatch(/^<!doctype html>/);
  });

  it("answers 404 for a report in another study or one that does not exist", async () => {
    const { reportId } = await draft();

    expect((await call("other-study", reportId)).status).toBe(404);
    expect((await call("any", "missing")).status).toBe(404);
  });

  it("answers 500 when the PDF cannot be made", async () => {
    const { f, reportId } = await draft();
    renderPdf.mockRejectedValue(new Error("no browser"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await call(f.studyId, reportId)).status).toBe(500);
  });
});
