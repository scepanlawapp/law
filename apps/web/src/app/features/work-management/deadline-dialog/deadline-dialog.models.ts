import { Observable } from "rxjs";
import {
  AssistantDeadlineRequest,
  DeadlineDetail,
  DeadlineRequest,
} from "@law/api-interfaces";

export interface DeadlineDialogContext {
  deadline?: DeadlineDetail;
  /** Values for a new deadline, e.g. proposed by the assistant. */
  initial?: AssistantDeadlineRequest;
  /** Saves the new deadline instead of the deadlines API (e.g. completing an assistant form). */
  save?: (request: DeadlineRequest) => Observable<unknown>;
  caseId?: string;
  clientId?: string;
  dueDate?: string;
}
