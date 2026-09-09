import { PDFParse } from "pdf-parse";
import { extractImageText } from "./ocr-extractor";

const DEFAULT_MIN_TEXT_CHARS = 50;
const DEFAULT_MAX_OCR_PAGES = 20;
const OCR_RENDER_SCALE = 2;

function readIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

// Text layer first; scanned/image-only PDFs fall back to rasterizing pages for OCR.
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const textLayer = result.text.trim();
    const minChars = readIntEnv(
      "PDF_OCR_MIN_TEXT_CHARS",
      DEFAULT_MIN_TEXT_CHARS,
    );
    if (textLayer.length >= minChars) return result.text;

    const maxPages = readIntEnv("PDF_OCR_MAX_PAGES", DEFAULT_MAX_OCR_PAGES);
    if (maxPages === 0) return result.text;

    const screenshots = await parser.getScreenshot({
      first: maxPages,
      scale: OCR_RENDER_SCALE,
      imageDataUrl: false,
      imageBuffer: true,
    });
    const pages: string[] = [];
    for (const page of screenshots.pages) {
      pages.push(await extractImageText(Buffer.from(page.data)));
    }
    const ocrText = pages.join("\n\n").trim();
    return ocrText.length > textLayer.length ? ocrText : result.text;
  } finally {
    await parser.destroy();
  }
}
