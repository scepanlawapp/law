import type { DocumentDetail } from "@law/api-interfaces";

export interface DocumentAssociationOption {
  id: string;
  label: string;
}

export interface DocumentAssociationsDialogContext {
  documentId: string;
  documentTitle: string;
  caseOptions: DocumentAssociationOption[];
  clientOptions: DocumentAssociationOption[];
  fixedCaseId?: string;
  fixedClientId?: string;
}

export type DocumentAssociationsDialogResult = DocumentDetail;
