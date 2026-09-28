import { BillingSuggestion } from "@law/api-interfaces";

export interface BillingEntryDialogContext {
  candidates?: BillingSuggestion[];
  clientId?: string;
  caseIds?: string[];
  kind?: "TIME" | "FIXED_FEE" | "EXPENSE";
}
