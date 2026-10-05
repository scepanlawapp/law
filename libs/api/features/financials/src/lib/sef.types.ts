import { SefValidationResult } from "@law/api-interfaces";

export const SEF_VALIDATION_VERSION =
  "UBL-2.1+SR-CIUS-2023-03-31+SEF-ITU-2026-10-01";

export interface SefPartySnapshot {
  name: string;
  taxId: string;
  registrationNumber: string;
  addressLine: string;
  city: string;
  postalCode: string;
  countryCode: string;
  email?: string | null;
}

export interface SefInvoiceSnapshot {
  invoice: {
    id: string;
    invoiceNumber: string;
    issueDate: string;
    dueDate: string;
    supplyDate: string;
    currency: string;
    comment: string;
    methodOfPayment: string;
    vatLiabilityTimingCode: string | null;
    netAmount: string;
    vatAmount: string;
    grossAmount: string;
  };
  supplier: SefPartySnapshot & { vatRegistered: boolean };
  customer: SefPartySnapshot & {
    isDomestic: boolean;
    isPublicSector: boolean;
    jbkjs: string | null;
  };
  payment: {
    accountId: string;
    accountNumber: string;
    model: string | null;
    reference: string | null;
  };
  lines: Array<{
    id: string;
    description: string;
    serviceDate: string;
    currency: string;
    netAmount: string;
    vatRate: string;
    vatAmount: string;
    grossAmount: string;
    taxCategoryCode: string | null;
    taxExemptionReasonCode: string | null;
    taxExemptionReasonText: string | null;
    pricingRequired: boolean;
  }>;
}

export interface PreparedSefInvoice {
  snapshot: SefInvoiceSnapshot;
  xml: string | null;
  validation: SefValidationResult;
}

export interface SefUploadIdentifiers {
  invoiceId: string;
  salesInvoiceId: string;
  purchaseInvoiceId: string;
  sanitizedResponse: Record<string, unknown>;
}

export class SefApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly httpStatus: number | null,
    readonly outcome: "FAILED" | "UNKNOWN",
    readonly sanitizedResponse?: Record<string, unknown>,
  ) {
    super(message);
  }
}
