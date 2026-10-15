import { Observable } from "rxjs";
import { TaskDetail, TaskRequest } from "@law/api-interfaces";

export interface TaskDialogContext {
  task?: TaskDetail;
  /** Values for a new task, e.g. proposed by the assistant. */
  initial?: TaskRequest;
  /** Saves the new task instead of the tasks API (e.g. completing an assistant form). */
  save?: (request: TaskRequest) => Observable<unknown>;
  caseId?: string;
  clientId?: string;
  deadlineId?: string;
}
