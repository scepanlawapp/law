import { PaymentDetail } from "@law/api-interfaces";
export interface PaymentFormContext {
  id?: string;
  clientId?: string;
  currency?: string;
  invoiceId?: string;
}
export interface PaymentViewContext {
  id: string;
}
export interface PaymentViewResult {
  edit?: boolean;
  payment?: PaymentDetail;
}
