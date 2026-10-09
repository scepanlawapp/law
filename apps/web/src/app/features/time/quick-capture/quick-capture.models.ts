import { Observable } from "rxjs";
import {
  CreateWorkEntryRequest,
  WorkEntry,
  WorkEntryTreatment,
  WorkEntrySourceType,
} from "@law/api-interfaces";

export interface QuickCaptureInput<TResult = WorkEntry> {
  /** Custom atomic save, used when capturing work also completes a task. */
  save?: (request: CreateWorkEntryRequest) => Observable<TResult>;
  /** Optional alternative when completing a task that already has work. */
  finishWithoutNewWork?: () => Observable<TResult>;
  /** Show entry-management actions when opened from task details. */
  manageEntry?: boolean;
  onDeleted?: () => void;
  userId?: string | null;
  taskId?: string;
  eventId?: string;
  clientId?: string;
  caseId?: string;
  minutes?: number;
  treatment?: WorkEntryTreatment;
  value?: string | null;
  currency?: string | null;
  /** Required when confirming a stopped timer; otherwise time is optional. */
  requireMinutes?: boolean;
  title?: string;
  description?: string;
  workDate?: string;
  mode: "create" | "confirm-timer" | "confirm-source" | "edit" | "view";
  entryId?: string;
  source?: { sourceType: WorkEntrySourceType; sourceId: string };
}
