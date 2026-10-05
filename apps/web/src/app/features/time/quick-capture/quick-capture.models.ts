import { WorkEntrySourceType } from "@law/api-interfaces";

export interface QuickCaptureInput {
  clientId?: string;
  caseId?: string;
  minutes?: number;
  /** Required when confirming a stopped timer; otherwise time is optional. */
  requireMinutes?: boolean;
  title?: string;
  description?: string;
  workDate?: string;
  mode: "create" | "confirm-timer" | "confirm-source" | "edit";
  entryId?: string;
  source?: { sourceType: WorkEntrySourceType; sourceId: string };
}
