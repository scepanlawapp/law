import {
  DocumentAiStatus,
  DocumentCategory,
  DocumentKind,
} from "@law/api-interfaces";
import { LabelMap } from "../select-option";

export const DOCUMENT_CATEGORY_LABELS: LabelMap<DocumentCategory> = {
  [DocumentCategory.CONTRACT_AGREEMENT]:
    "documents.category.CONTRACT_AGREEMENT",
  [DocumentCategory.POWER_OF_ATTORNEY]: "documents.category.POWER_OF_ATTORNEY",
  [DocumentCategory.PLEADING_SUBMISSION]:
    "documents.category.PLEADING_SUBMISSION",
  [DocumentCategory.COURT_AUTHORITY_DECISION]:
    "documents.category.COURT_AUTHORITY_DECISION",
  [DocumentCategory.SUMMONS_OFFICIAL_NOTICE]:
    "documents.category.SUMMONS_OFFICIAL_NOTICE",
  [DocumentCategory.MINUTES_OFFICIAL_RECORD]:
    "documents.category.MINUTES_OFFICIAL_RECORD",
  [DocumentCategory.EVIDENCE]: "documents.category.EVIDENCE",
  [DocumentCategory.EXPERT_REPORT]: "documents.category.EXPERT_REPORT",
  [DocumentCategory.CORRESPONDENCE]: "documents.category.CORRESPONDENCE",
  [DocumentCategory.IDENTITY_REGISTRATION]:
    "documents.category.IDENTITY_REGISTRATION",
  [DocumentCategory.CERTIFICATE_EXTRACT]:
    "documents.category.CERTIFICATE_EXTRACT",
  [DocumentCategory.FINANCIAL_DOCUMENT]:
    "documents.category.FINANCIAL_DOCUMENT",
  [DocumentCategory.LEGAL_OPINION_ANALYSIS]:
    "documents.category.LEGAL_OPINION_ANALYSIS",
  [DocumentCategory.OTHER]: "documents.category.OTHER",
};

export const DOCUMENT_AI_STATUS_LABELS: LabelMap<DocumentAiStatus> = {
  [DocumentAiStatus.OFF]: "documents.ai.status.OFF",
  [DocumentAiStatus.QUEUED]: "documents.ai.status.QUEUED",
  [DocumentAiStatus.PROCESSING]: "documents.ai.status.PROCESSING",
  [DocumentAiStatus.READY]: "documents.ai.status.READY",
  [DocumentAiStatus.FAILED]: "documents.ai.status.FAILED",
  [DocumentAiStatus.UNSUPPORTED]: "documents.ai.status.UNSUPPORTED",
};

export const DOCUMENT_KIND_LABELS: LabelMap<DocumentKind> = {
  [DocumentKind.ID_CARD]: "documents.ai.kind.ID_CARD",
  [DocumentKind.PASSPORT]: "documents.ai.kind.PASSPORT",
  [DocumentKind.APR_EXCERPT]: "documents.ai.kind.APR_EXCERPT",
  [DocumentKind.COURT_DECISION]: "documents.ai.kind.COURT_DECISION",
  [DocumentKind.ADMIN_DECISION]: "documents.ai.kind.ADMIN_DECISION",
  [DocumentKind.OTHER]: "documents.ai.kind.OTHER",
};

/** AI processing that is still running and may change on its own. */
export const DOCUMENT_AI_IN_PROGRESS_STATUSES: readonly DocumentAiStatus[] = [
  DocumentAiStatus.QUEUED,
  DocumentAiStatus.PROCESSING,
];
