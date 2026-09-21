import { FormControl } from "@angular/forms";
import { DocumentDetail } from "@law/api-interfaces";

export const DOCUMENT_UPLOAD_MAX_BYTES = 25_000_000;
export const DOCUMENT_TITLE_MAX = 320;
export const DOCUMENT_UPLOAD_CONCURRENCY = 2;
export const DOCUMENT_FILE_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.txt,.xls,.xlsx,.docx";

export const DOCUMENT_ALLOWED_EXTENSIONS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".txt",
  ".xls",
  ".xlsx",
  ".docx",
] as const;

export type DocumentUploadMode = "create" | "version";

export type DocumentUploadRowStatus =
  | "ready"
  | "invalid"
  | "queued"
  | "uploading"
  | "processing"
  | "succeeded"
  | "failed"
  | "outcome_unknown";

export interface FrozenCreatePayload {
  title: string;
  caseIds: string[];
  clientIds: string[];
  originalFilename: string;
}

export interface FrozenVersionPayload {
  documentId: string;
  originalFilename: string;
}

export interface DocumentUploadRow {
  id: string;
  file: File;
  titleControl: FormControl<string>;
  status: DocumentUploadRowStatus;
  loaded: number;
  total: number | null;
  percent: number | null;
  advisoryMimeWarning: boolean;
  errorText: string | null;
  idempotencyKey: string | null;
  frozenCreate: FrozenCreatePayload | null;
  frozenVersion: FrozenVersionPayload | null;
  result: DocumentDetail | null;
  expanded: boolean;
}

export interface DocumentUploadAssociation {
  id: string;
  label: string;
}
