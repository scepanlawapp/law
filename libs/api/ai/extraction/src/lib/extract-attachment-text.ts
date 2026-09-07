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

export async function extractAttachmentText(
  input: AttachmentExtractionInput,
): Promise<AttachmentExtractionResult> {
  try {
    if (input.mimeType === "text/plain") {
      return { status: "COMPLETED", text: extractPlainText(input.buffer) };
    }
    if (input.mimeType === "application/pdf") {
      return {
        status: "COMPLETED",
        text: await extractPdfText(input.buffer),
      };
    }
    if (input.mimeType === DOCX_MIME_TYPE) {
      return {
        status: "COMPLETED",
        text: await extractDocxText(input.buffer),
      };
    }
    if (SPREADSHEET_MIME_TYPES.has(input.mimeType)) {
      return {
        status: "COMPLETED",
        text: extractSpreadsheetText(input.buffer),
      };
    }
    if (IMAGE_MIME_TYPES.has(input.mimeType)) {
      return {
        status: "COMPLETED",
        text: await extractImageText(input.buffer),
      };
    }
    return {
      status: "UNSUPPORTED",
      error: `No extractor registered for MIME type: ${input.mimeType}`,
    };
  } catch (error) {
    return {
      status: "FAILED",
      error: error instanceof Error ? error.message : "Extraction failed",
    };
  }
}
