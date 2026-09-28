import { BillingSuggestion } from "@law/api-interfaces";

export interface BillingStatementLineDialogContext {
  candidates?: BillingSuggestion[];
  clientId?: string;
}
