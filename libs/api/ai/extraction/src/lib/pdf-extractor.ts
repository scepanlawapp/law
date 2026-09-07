import { PDFParse } from "pdf-parse";

// Only reads the embedded text layer; scanned/image-only PDFs yield empty text.
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
