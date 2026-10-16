import {
  AllocationState,
  InvoiceCollectionStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentPurpose,
  PaymentStatus,
  PriceSourceScope,
  SefSubmissionState,
} from "@law/api-interfaces";
import { LabelMap } from "../select-option";
import { SortFields, SortKind } from "../sort";

export const INVOICE_STATUS_LABELS: LabelMap<InvoiceStatus> = {
  [InvoiceStatus.DRAFT]: "finance.draft",
  [InvoiceStatus.SENT]: "finance.sent",
  [InvoiceStatus.VOIDED]: "finance.voided",
};

export const INVOICE_COLLECTION_STATUS_LABELS: LabelMap<InvoiceCollectionStatus> =
  {
    [InvoiceCollectionStatus.UNPAID]: "payments.collection.UNPAID",
    [InvoiceCollectionStatus.PARTIALLY_PAID]:
      "payments.collection.PARTIALLY_PAID",
    [InvoiceCollectionStatus.PAID]: "payments.collection.PAID",
  };

export const SEF_SUBMISSION_STATE_LABELS: LabelMap<SefSubmissionState> = {
  [SefSubmissionState.PREPARED]: "finance.sef.state.PREPARED",
  [SefSubmissionState.SENDING]: "finance.sef.state.SENDING",
  [SefSubmissionState.SUBMITTED]: "finance.sef.state.SUBMITTED",
  [SefSubmissionState.FAILED]: "finance.sef.state.FAILED",
  [SefSubmissionState.UNKNOWN]: "finance.sef.state.UNKNOWN",
};

export const PAYMENT_METHOD_LABELS: LabelMap<PaymentMethod> = {
  [PaymentMethod.BANK_TRANSFER]: "payments.bank",
  [PaymentMethod.CASH]: "payments.cash",
  [PaymentMethod.CARD]: "payments.card",
  [PaymentMethod.OTHER]: "payments.other",
};

export const PAYMENT_PURPOSE_LABELS: LabelMap<PaymentPurpose> = {
  [PaymentPurpose.REGULAR]: "payments.regular",
  [PaymentPurpose.ADVANCE]: "payments.advance",
};

export const PAYMENT_STATUS_LABELS: LabelMap<PaymentStatus> = {
  [PaymentStatus.ACTIVE]: "payments.active",
  [PaymentStatus.VOIDED]: "payments.voided",
};

export const ALLOCATION_STATE_LABELS: LabelMap<AllocationState> = {
  [AllocationState.UNALLOCATED]: "payments.unallocated",
  [AllocationState.PARTIAL]: "payments.partial",
  [AllocationState.FULL]: "payments.full",
};

/** Payment audit actions the UI names; others read as a generic change. */
export const PAYMENT_AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  PAYMENT_CREATED: "payments.audit.PAYMENT_CREATED",
  PAYMENT_UPDATED: "payments.audit.PAYMENT_UPDATED",
  PAYMENT_VOIDED: "payments.audit.PAYMENT_VOIDED",
};
export const PAYMENT_AUDIT_FALLBACK_LABEL = "payments.audit.changed";

export const PAYMENT_SORT_FIELDS = {
  receivedAt: { label: "payments.field.receivedAt", kind: SortKind.DATE },
  clientName: { label: "payments.field.clientName", kind: SortKind.TEXT },
  amount: { label: "payments.field.amount", kind: SortKind.NUMBER },
  unallocatedAmount: {
    label: "payments.field.unallocatedAmount",
    kind: SortKind.NUMBER,
  },
} as const satisfies SortFields<string>;
export type PaymentSortField = keyof typeof PAYMENT_SORT_FIELDS;

/** Price-source tabs; case overrides are listed under client agreements. */
export type PriceSourceTab = Exclude<
  PriceSourceScope,
  typeof PriceSourceScope.CASE_OVERRIDE
>;

export const PRICE_SOURCE_TAB_LABELS: LabelMap<PriceSourceTab> = {
  [PriceSourceScope.CLIENT_AGREEMENT]: "finance.clientAgreements",
  [PriceSourceScope.WORKSPACE_PUBLIC_REFERENCE]: "finance.publicReferences",
  [PriceSourceScope.COMPANY_CATALOG]: "finance.companyCatalog",
};
