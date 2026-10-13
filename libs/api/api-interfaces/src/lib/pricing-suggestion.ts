export interface PricingFacts {
  claimValue?: string;
  claimCurrency?: string;
  proceedingType?: string;
  legalAction?: string;
  representedParties?: number;
  quantity?: number;
  hearingMinutes?: number;
  notes?: string;
}

export interface PricingSuggestionWork {
  title: string;
  description?: string;
  workDate: string;
  clientId?: string;
  caseId?: string;
  minutes?: number | null;
  serviceCategoryId?: string;
}

export type PricingSuggestionRequest = {
  pricingFacts?: PricingFacts;
} & (
  | { kind: "SAVED"; workEntryId: string }
  | { kind: "UNSAVED"; work: PricingSuggestionWork }
);

export type PricingSuggestionStatus =
  | "SUGGESTED"
  | "NEEDS_INFORMATION"
  | "NEEDS_REVIEW"
  | "UNSUPPORTED";

export interface PricingSourceEvidence {
  id: string;
  sourceId: string;
  versionId: string | null;
  version: number | null;
  kind: "PRICE_SOURCE" | "LEGAL_TARIFF" | "HOURLY_PROFILE" | "RETAINER";
  title: string;
  reference: string | null;
  sourceUrl: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  excerpt: string;
  dateExcerpt?: string | null;
}

export interface MissingPricingFact {
  key: string;
  label: string;
  reason: string;
  type: "TEXT" | "DECIMAL" | "INTEGER";
}

export interface PricingSuggestionAlternative {
  suggestedPrice: string;
  currency: string;
  explanation: string;
  calculation: {
    formula: string;
    operands: Record<string, string>;
    rounding: string;
  };
  sources: PricingSourceEvidence[];
}

export interface PricingSuggestionResponse {
  status: PricingSuggestionStatus;
  suggestedPrice: string | null;
  currency: string | null;
  explanation: string;
  reviewRequired: true;
  confidence: "EVIDENCE_BACKED_SUGGESTION" | "UNDETERMINED";
  calculation: PricingSuggestionAlternative["calculation"] | null;
  sources: PricingSourceEvidence[];
  missingInformation: MissingPricingFact[];
  warnings: string[];
  alternatives: PricingSuggestionAlternative[];
}
