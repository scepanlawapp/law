export type AttachmentExtractionStatus = "COMPLETED" | "FAILED" | "UNSUPPORTED";

export interface AttachmentExtractionInput {
  mimeType: string;
  buffer: Buffer;
}

export interface AttachmentExtractionResult {
  status: AttachmentExtractionStatus;
  text?: string;
  error?: string;
}
