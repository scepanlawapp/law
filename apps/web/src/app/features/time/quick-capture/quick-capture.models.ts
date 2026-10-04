import { WorkEntrySourceType } from "@law/api-interfaces";

export interface QuickCaptureInput {
  clientId?: string;
  caseId?: string;
  minutes?: number;
  description?: string;
  workDate?: string;
  mode: "create" | "confirm-timer" | "confirm-source" | "edit";
  entryId?: string;
  source?: { sourceType: WorkEntrySourceType; sourceId: string };
}
