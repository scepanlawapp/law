import type { Script } from "@law/transliteration";

export type AttachmentExtractionStatus = "COMPLETED" | "FAILED" | "UNSUPPORTED";

export interface AttachmentExtractionInput {
  mimeType: string;
  buffer: Buffer;
}

export interface AttachmentExtractionResult {
  status: AttachmentExtractionStatus;
  // Always Serbian Latin; the original script is reported in sourceScript.
  text?: string;
  sourceScript?: Script;
  error?: string;
}
