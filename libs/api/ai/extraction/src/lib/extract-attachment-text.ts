import { detectScript, toLatin } from "@law/transliteration";
import { AttachmentExtractionInput, AttachmentExtractionResult } from "./types";
import { extractPlainText } from "./text-extractor";
import { extractPdfText } from "./pdf-extractor";
import { extractDocxText } from "./docx-extractor";
import { extractSpreadsheetText } from "./spreadsheet-extractor";
import { extractImageText } from "./ocr-extractor";

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const SPREADSHEET_MIME_TYPES = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function extractRawText(
  input: AttachmentExtractionInput,
): Promise<string | null> {
  if (input.mimeType === "text/plain") return extractPlainText(input.buffer);
  if (input.mimeType === "application/pdf") return extractPdfText(input.buffer);
  if (input.mimeType === DOCX_MIME_TYPE) return extractDocxText(input.buffer);
  if (SPREADSHEET_MIME_TYPES.has(input.mimeType)) {
    return extractSpreadsheetText(input.buffer);
  }
  if (IMAGE_MIME_TYPES.has(input.mimeType))
    return extractImageText(input.buffer);
  return null;
}

export async function extractAttachmentText(
  input: AttachmentExtractionInput,
): Promise<AttachmentExtractionResult> {
  try {
    const raw = await extractRawText(input);
    if (raw === null) {
      return {
        status: "UNSUPPORTED",
        error: `No extractor registered for MIME type: ${input.mimeType}`,
      };
    }
    return {
      status: "COMPLETED",
      text: toLatin(raw),
      sourceScript: detectScript(raw),
    };
  } catch (error) {
    return {
      status: "FAILED",
      error: error instanceof Error ? error.message : "Extraction failed",
    };
  }
}
