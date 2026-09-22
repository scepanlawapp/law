import { DocumentDetail } from "@law/api-interfaces";
import { DocumentUploadMode } from "./document-upload.models";

export interface DocumentUploadDialogContext {
  mode?: DocumentUploadMode;
  documentId?: string;
  caseId?: string;
  caseLabel?: string;
  clientId?: string;
  clientLabel?: string;
  lockCase?: boolean;
  lockClient?: boolean;
}

export interface DocumentUploadDialogResult {
  documents: DocumentDetail[];
}
