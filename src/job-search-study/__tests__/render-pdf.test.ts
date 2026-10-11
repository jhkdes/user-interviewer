import { describe, expect, it, vi } from "vitest";
import { renderReportPdf, type PdfBrowser, type PdfPage } from "../report/render-pdf";

function fakeBrowser(options: { pdfFails?: boolean; closeFails?: boolean } = {}) {
  const calls: string[] = [];
  const page: PdfPage = {
    emulateMediaType: vi.fn(async (type) => void calls.push(`media:${type}`)),
    emulateMediaFeatures: vi.fn(async (features) => {
      calls.push(`feature:${features[0].name}=${features[0].value}`);
    }),
    setContent: vi.fn(async (html) => void calls.push(`content:${html}`)),
    pdf: vi.fn(async (pdfOptions) => {
      calls.push(`pdf:${pdfOptions.format}:${pdfOptions.printBackground}`);
      if (options.pdfFails) throw new Error("print failed");
      return new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    }),
  };
  const browser: PdfBrowser = {
    newPage: async () => page,
    close: vi.fn(async () => {
      calls.push("closed");
      if (options.closeFails) throw new Error("already gone");
    }),
  };
  return { browser, calls };
}

describe("renderReportPdf", () => {
  it("prints the HTML in light mode with print styles, as a Letter PDF with backgrounds", async () => {
    const { browser, calls } = fakeBrowser();

    const pdf = await renderReportPdf("<p>Hello</p>", async () => browser);

    expect(pdf.toString()).toBe("%PDF");
    expect(calls).toEqual([
      "media:print",
      "feature:prefers-color-scheme=light",
      "content:<p>Hello</p>",
      "pdf:Letter:true",
      "closed",
    ]);
  });

  it("closes the browser when printing fails, and reports the failure", async () => {
    const { browser, calls } = fakeBrowser({ pdfFails: true });

    await expect(renderReportPdf("<p>x</p>", async () => browser)).rejects.toThrow("print failed");

    expect(calls.at(-1)).toBe("closed");
  });

  it("does not let a failed close hide the PDF", async () => {
    const { browser } = fakeBrowser({ closeFails: true });

    await expect(renderReportPdf("<p>x</p>", async () => browser)).resolves.toBeInstanceOf(Buffer);
  });

  it("reports a failure to start the browser", async () => {
    await expect(
      renderReportPdf("<p>x</p>", async () => {
        throw new Error("no browser");
      }),
    ).rejects.toThrow("no browser");
  });
});
