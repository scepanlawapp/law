import { DOCUMENT_ALLOWED_MIME_TYPES } from "./storage.types";

const PDF = Buffer.from("%PDF");
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF87 = Buffer.from("GIF87a");
const GIF89 = Buffer.from("GIF89a");
const RIFF = Buffer.from("RIFF");
const WEBP = Buffer.from("WEBP");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function startsWith(buffer: Buffer, signature: Buffer, offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return buffer.subarray(offset, offset + signature.length).equals(signature);
}

function looksLikeUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return decoded.length > 0;
  } catch {
    return false;
  }
}

export function detectMimeType(buffer: Buffer): string | null {
  if (!buffer.length) return null;
  if (startsWith(buffer, PDF)) return "application/pdf";
  if (startsWith(buffer, JPEG)) return "image/jpeg";
  if (startsWith(buffer, PNG)) return "image/png";
  if (startsWith(buffer, GIF87) || startsWith(buffer, GIF89)) {
    return "image/gif";
  }
  if (
    startsWith(buffer, RIFF) &&
    buffer.length >= 12 &&
    startsWith(buffer, WEBP, 8)
  ) {
    return "image/webp";
  }
  if (startsWith(buffer, OLE)) return "application/vnd.ms-excel";
  if (startsWith(buffer, ZIP)) {
    const ascii = buffer.toString("latin1");
    if (ascii.includes("word/")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    if (ascii.includes("xl/")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    return null;
  }
  if (looksLikeUtf8Text(buffer)) return "text/plain";
  return null;
}

export function isAllowedDocumentMime(mime: string | null): boolean {
  return (
    !!mime && (DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
  );
}
