import type { CreateWorkEntryRequest } from "./work-entries";
import type { PriceSourceScope } from "./api-interfaces";

/** Full current form snapshot; id is an existing WorkEntry id, never an Event id. */
export interface PriceSuggestionWorkEvent
  extends Omit<CreateWorkEntryRequest, "value" | "aiParsed" | "source"> {
  id?: string;
  additionalInformation?: string;
  /** Portion of the whole task performed by this entry, greater than 0 and at most 1. */
  taskCompletionFraction?: number;
}
export interface PriceSuggestionRequest {
  workEvent: PriceSuggestionWorkEvent;
}
export type PriceSuggestionConfidence = "LOW" | "MEDIUM" | "HIGH";
export interface PriceSuggestionSource {
  id: string;
  kind: PriceSourceScope | "RETAINER" | "CLIENT_HOURLY_RATE";
  title: string;
  versionId: string | null;
  sourceUrl: string | null;
}
export interface PriceSuggestionResponse {
  /** Recorded performed-work value, not an invoice or additional retainer charge. */
  suggestedPrice: number | null;
  currency: string;
  explanation: string;
  reviewRequired: boolean;
  confidence: PriceSuggestionConfidence;
  missingInformation: string[];
  warnings: string[];
  sources: PriceSuggestionSource[];
}
