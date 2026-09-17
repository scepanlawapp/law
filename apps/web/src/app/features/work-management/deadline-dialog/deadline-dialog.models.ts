import { DeadlineDetail } from "@law/api-interfaces";

export interface DeadlineDialogContext {
  deadline?: DeadlineDetail;
  caseId?: string;
  clientId?: string;
}
