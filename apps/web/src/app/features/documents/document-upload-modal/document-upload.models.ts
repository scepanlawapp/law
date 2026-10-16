import { FormControl } from "@angular/forms";
import { DocumentCategory, DocumentDetail } from "@law/api-interfaces";

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

export const DocumentUploadMode = {
  CREATE: "create",
  VERSION: "version",
} as const;
export type DocumentUploadMode =
  (typeof DocumentUploadMode)[keyof typeof DocumentUploadMode];

export const DocumentUploadRowStatus = {
  READY: "ready",
  INVALID: "invalid",
  QUEUED: "queued",
  UPLOADING: "uploading",
  PROCESSING: "processing",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  OUTCOME_UNKNOWN: "outcome_unknown",
} as const;
export type DocumentUploadRowStatus =
  (typeof DocumentUploadRowStatus)[keyof typeof DocumentUploadRowStatus];

/** Rows sent to the server whose request has not finished yet. */
export const ACTIVE_UPLOAD_STATUSES: readonly DocumentUploadRowStatus[] = [
  DocumentUploadRowStatus.QUEUED,
  DocumentUploadRowStatus.UPLOADING,
  DocumentUploadRowStatus.PROCESSING,
];

/** Rows not sent yet; their file can still be edited or removed. */
export const PENDING_UPLOAD_STATUSES: readonly DocumentUploadRowStatus[] = [
  DocumentUploadRowStatus.READY,
  DocumentUploadRowStatus.INVALID,
];

export const FINISHED_UPLOAD_STATUSES: readonly DocumentUploadRowStatus[] = [
  DocumentUploadRowStatus.SUCCEEDED,
  DocumentUploadRowStatus.FAILED,
  DocumentUploadRowStatus.OUTCOME_UNKNOWN,
];

export const DOCUMENT_UPLOAD_STATUS_LABELS: Readonly<
  Record<DocumentUploadRowStatus, string>
> = {
  [DocumentUploadRowStatus.READY]: "documents.upload.statusReady",
  [DocumentUploadRowStatus.INVALID]: "documents.upload.statusInvalid",
  [DocumentUploadRowStatus.QUEUED]: "documents.upload.statusQueued",
  [DocumentUploadRowStatus.UPLOADING]: "documents.upload.statusUploading",
  [DocumentUploadRowStatus.PROCESSING]: "documents.upload.statusProcessing",
  [DocumentUploadRowStatus.SUCCEEDED]: "documents.upload.statusUploaded",
  [DocumentUploadRowStatus.FAILED]: "documents.upload.statusFailed",
  [DocumentUploadRowStatus.OUTCOME_UNKNOWN]: "documents.upload.statusUnknown",
};

export interface FrozenCreatePayload {
  folderId: string | null;
  title: string;
  category: DocumentCategory | null;
  caseIds: string[];
  clientIds: string[];
  aiAccess: boolean;
  originalFilename: string;
}

export interface FrozenVersionPayload {
  documentId: string;
  originalFilename: string;
}

export interface DocumentUploadRow {
  id: string;
  file: File;
  relativePath: string;
  relativeDirectoryPath: string;
  folderId: string | null;
  titleControl: FormControl<string>;
  category: DocumentCategory | null;
  /** Document-level AI access; only meaningful (and sent) in create mode. */
  aiAccess: boolean;
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
