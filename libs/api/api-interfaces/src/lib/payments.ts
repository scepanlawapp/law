import type { SortDirection, InvoiceStatus } from "./api-interfaces";
export const PaymentMethod = {
  BANK_TRANSFER: "BANK_TRANSFER",
  CASH: "CASH",
  CARD: "CARD",
  OTHER: "OTHER",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export const PaymentPurpose = {
  REGULAR: "REGULAR",
  ADVANCE: "ADVANCE",
} as const;
export type PaymentPurpose =
  (typeof PaymentPurpose)[keyof typeof PaymentPurpose];
export const PaymentStatus = {
  ACTIVE: "ACTIVE",
  VOIDED: "VOIDED",
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];
export const AllocationState = {
  UNALLOCATED: "UNALLOCATED",
  PARTIAL: "PARTIAL",
  FULL: "FULL",
} as const;
export type AllocationState =
  (typeof AllocationState)[keyof typeof AllocationState];
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
  direction?: SortDirection;
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
  collectionStatus: InvoiceCollectionStatus;
  overdue: boolean;
  daysOverdue: number;
  status: InvoiceStatus;
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

export const PaymentAllocationMode = {
  AUTOMATIC: "AUTOMATIC",
  SELECTED_OLDEST: "SELECTED_OLDEST",
  EQUAL: "EQUAL",
} as const;
export type PaymentAllocationMode =
  (typeof PaymentAllocationMode)[keyof typeof PaymentAllocationMode];
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

/** Supported payment currencies; shared by API validation and UI catalogs. */
export const SUPPORTED_PAYMENT_CURRENCIES = [
  "RSD",
  "EUR",
  "USD",
  "CHF",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CNY",
  "HKD",
  "SGD",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "BGN",
  "TRY",
  "AED",
  "SAR",
  "INR",
  "BRL",
  "MXN",
  "ZAR",
] as const;

export const InvoiceCollectionStatus = {
  UNPAID: "UNPAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
} as const;
export type InvoiceCollectionStatus =
  (typeof InvoiceCollectionStatus)[keyof typeof InvoiceCollectionStatus];
