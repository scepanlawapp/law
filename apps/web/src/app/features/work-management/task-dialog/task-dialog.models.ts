import { TaskDetail } from "@law/api-interfaces";

export interface TaskDialogContext {
  task?: TaskDetail;
  caseId?: string;
  clientId?: string;
  deadlineId?: string;
}
