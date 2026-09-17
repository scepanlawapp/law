import { NoteDetail } from "@law/api-interfaces";

export interface NoteDialogContext {
  note?: NoteDetail;
  type?: NoteDetail["type"];
  caseId?: string;
  clientId?: string;
  eventId?: string;
}
