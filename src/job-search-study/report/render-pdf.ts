import { existsSync } from "node:fs";

/**
 * Turns the report's HTML into a PDF with headless Chromium, so the attachment
 * is the same page the reviewer previews and the participant would see in a
 * browser. On Vercel (a Linux function with no browser installed) it uses the
 * bundled @sparticuz/chromium; elsewhere it uses a locally installed Chrome or
 * Edge, found automatically or named by CHROME_EXECUTABLE_PATH.
 *
 * The browser interface here is only the few calls used, so tests can supply a
 * fake instead of launching Chromium.
 */

export type PdfRenderer = (html: string) => Promise<Buffer>;

export interface PdfPage {
  emulateMediaType(type: "print" | "screen"): Promise<void>;
  emulateMediaFeatures(features: Array<{ name: string; value: string }>): Promise<void>;
  setContent(html: string, options: { waitUntil: "load" }): Promise<void>;
  pdf(options: {
    format: "Letter";
    printBackground: boolean;
    margin: { top: string; right: string; bottom: string; left: string };
  }): Promise<Uint8Array>;
}

export interface PdfBrowser {
  newPage(): Promise<PdfPage>;
  close(): Promise<void>;
}

const LOCAL_BROWSER_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

async function launchBrowser(): Promise<PdfBrowser> {
  const puppeteer = (await import("puppeteer-core")).default;
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (serverless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  }

  const executablePath =
    process.env.CHROME_EXECUTABLE_PATH ||
    LOCAL_BROWSER_PATHS.find((candidate) => existsSync(candidate));
  if (!executablePath) {
    throw new Error(
      "No Chrome or Edge found to create the PDF. Install one, or set CHROME_EXECUTABLE_PATH.",
    );
  }
  return puppeteer.launch({ executablePath, headless: true });
}

/**
 * Renders the HTML to a Letter-size PDF in light mode with print styles. Always
 * closes the browser, including when rendering fails.
 */
export async function renderReportPdf(
  html: string,
  launch: () => Promise<PdfBrowser> = launchBrowser,
): Promise<Buffer> {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.emulateMediaType("print");
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      margin: { top: "0.6in", right: "0.6in", bottom: "0.6in", left: "0.6in" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
