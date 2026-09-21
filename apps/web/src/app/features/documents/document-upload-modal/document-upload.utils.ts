import { HttpErrorResponse } from "@angular/common/http";
import {
  DOCUMENT_ALLOWED_EXTENSIONS,
  DOCUMENT_TITLE_MAX,
  DOCUMENT_UPLOAD_MAX_BYTES,
} from "./document-upload.models";

export function titleFromFilename(filename: string): string {
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0) return trimmed;
  return trimmed.slice(0, lastDot).trim() || trimmed;
}

export function fileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0) return "";
  return filename.slice(lastDot).toLowerCase();
}

export function hasAdvisoryDisallowedType(file: File): boolean {
  const extension = fileExtension(file.name);
  if (!extension) return false;
  return !(DOCUMENT_ALLOWED_EXTENSIONS as readonly string[]).includes(
    extension,
  );
}

export function validateTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "documents.upload.errorTitleRequired";
  if (trimmed.length > DOCUMENT_TITLE_MAX) {
    return "documents.upload.errorTitleMax";
  }
  return null;
}

export function validateSize(
  size: number,
  maxBytes = DOCUMENT_UPLOAD_MAX_BYTES,
): string | null {
  if (size <= 0) return "documents.upload.errorEmptyFile";
  if (size > maxBytes) return "documents.upload.errorTooLarge";
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export function clampPercent(loaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
}

export function buildDocumentCreateFormData(input: {
  title: string;
  caseIds: string[];
  clientIds: string[];
  file: File;
}): FormData {
  const body = new FormData();
  body.append("title", input.title);
  for (const id of input.caseIds) body.append("caseIds", id);
  for (const id of input.clientIds) body.append("clientIds", id);
  body.append("file", input.file, input.file.name);
  return body;
}

export function buildDocumentVersionFormData(file: File): FormData {
  const body = new FormData();
  body.append("file", file, file.name);
  return body;
}

export function httpErrorText(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = extractMessage(error.error);
    if (message && message.length <= 160) return message;
    if (error.status === 0) return "documents.upload.errorUnreachable";
    if (error.status === 413) return "documents.upload.errorTooLarge";
  }
  return "documents.upload.errorGeneric";
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("message" in body)) return null;
  const message = (body as { message: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && typeof message[0] === "string") {
    return message[0];
  }
  return null;
}

export function newRowId(): string {
  return crypto.randomUUID();
}
