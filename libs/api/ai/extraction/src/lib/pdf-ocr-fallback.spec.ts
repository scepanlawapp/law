import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractAttachmentText } from "./extract-attachment-text";
import { terminateOcrWorker } from "./ocr-extractor";

// Real Tesseract run against an image-only PDF; needs ./tessdata (scripts/download-tessdata.sh).
// Run: RUN_OCR_INTEGRATION=1 NODE_OPTIONS=--experimental-vm-modules npx jest --config libs/api/ai/extraction/jest.config.cts pdf-ocr-fallback
const describeIntegration = process.env["RUN_OCR_INTEGRATION"]
  ? describe
  : describe.skip;

describeIntegration("scanned PDF OCR fallback", () => {
  const fixture = join(__dirname, "__fixtures__", "scanned-cyrillic.pdf");
  const previousTessdata = process.env["TESSDATA_DIR"];

  beforeAll(() => {
    process.env["TESSDATA_DIR"] = join(process.cwd(), "tessdata");
  });

  afterAll(async () => {
    await terminateOcrWorker();
    if (previousTessdata === undefined) delete process.env["TESSDATA_DIR"];
    else process.env["TESSDATA_DIR"] = previousTessdata;
  });

  it("rasterizes pages, OCRs Cyrillic and normalizes to Latin", async () => {
    const result = await extractAttachmentText({
      mimeType: "application/pdf",
      buffer: readFileSync(fixture),
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe("COMPLETED");
    expect(result.sourceScript).toBe("CYRILLIC");
    expect(result.text).toMatch(/Presuda/i);
    expect(result.text).toMatch(/Beogradu/i);
    expect(result.text).not.toMatch(/[\u0400-\u04FF]/);
  }, 120_000);
});
