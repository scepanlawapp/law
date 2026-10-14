export type PaymentMethod = "BANK_TRANSFER" | "CASH" | "CARD" | "OTHER";
export type PaymentPurpose = "REGULAR" | "ADVANCE";
export type PaymentStatus = "ACTIVE" | "VOIDED";
export type AllocationState = "UNALLOCATED" | "PARTIAL" | "FULL";
export interface PaymentAllocationInput {
  invoiceId: string;
  amount: string;
}
export interface SavePaymentRequest {
  clientId?: string | null;
  amount: string;
  currency: string;
  receivedAt: string;
  paymentMethod: PaymentMethod;
  purpose: PaymentPurpose;
  reference?: string | null;
  payerName?: string | null;
  note?: string | null;
  bankAccountId?: string | null;
  bankStatementNumber?: string | null;
  allocations: PaymentAllocationInput[];
  version?: number;
}
export interface PaymentQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  clientId?: string;
  currency?: string;
  from?: string;
  to?: string;
  paymentMethod?: PaymentMethod | "";
  purpose?: PaymentPurpose | "";
  status?: PaymentStatus | "";
  allocationState?: AllocationState | "";
  bankAccountId?: string;
  sort?: "receivedAt" | "amount" | "clientName" | "unallocatedAmount";
  direction?: "asc" | "desc";
}
export interface PaymentSummary {
  id: string;
  clientId: string | null;
  clientName: string | null;
  payerName: string | null;
  receivedAt: string;
  amount: string;
  currency: string;
  paymentMethod: PaymentMethod;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  reference: string | null;
  note: string | null;
  bankAccountId: string | null;
  bankStatementNumber?: string | null;
  allocatedAmount: string;
  unallocatedAmount: string;
  allocationState: AllocationState;
  version: number;
}
export interface InvoiceCollection {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  currency: string;
  dateOfCreate: string;
  dateOfMaturity: string;
  grossAmount: string;
  paidAmount: string;
  remainingAmount: string;
  collectionStatus: "UNPAID" | "PARTIALLY_PAID" | "PAID";
  overdue: boolean;
  daysOverdue: number;
  status: "DRAFT" | "SENT" | "VOIDED";
}
export interface PaymentAllocation extends InvoiceCollection {
  allocationId: string;
  amount: string;
  removedAt: string | null;
}
export interface PaymentAudit {
  id: string;
  action: string;
  actor: string;
  createdAt: string;
  reason: string | null;
  previousData: unknown;
  newData: unknown;
}
export interface PaymentDetail extends PaymentSummary {
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  voidReason: string | null;
  voidedAt: string | null;
  bankAccountName: string | null;
  allocations: PaymentAllocation[];
  auditEvents: PaymentAudit[];
}
export type PaymentPage =
  import("./api-interfaces").PaginatedResponse<PaymentSummary>;
export interface CollectionTotals {
  currency: string;
  received: string;
  allocated: string;
  unallocated: string;
  advances: string;
  outstanding: string;
  overdue: string;
  unpaidInvoices: number;
}
export interface PaymentOptions {
  currencies: string[];
  defaultCurrency: string;
  today: string;
  bankAccounts: { id: string; name: string; currencyCode: string }[];
}
export interface InvoicePaymentHistory {
  paymentId: string;
  amount: string;
  paymentAmount: string;
  receivedAt: string;
  paymentMethod: PaymentMethod;
  reference: string | null;
  status: PaymentStatus;
  removedAt: string | null;
}

export type PaymentAllocationMode = "AUTOMATIC" | "SELECTED_OLDEST" | "EQUAL";
export interface PaymentAllocationPreviewRequest {
  clientId: string;
  currency: string;
  amount: string;
  purpose: PaymentPurpose;
  paymentId?: string;
  reference?: string | null;
  mode: PaymentAllocationMode;
  invoiceIds?: string[];
}
export interface PaymentAllocationPreview {
  allocations: PaymentAllocationInput[];
  allocatedAmount: string;
  unallocatedAmount: string;
  warning: string | null;
}
