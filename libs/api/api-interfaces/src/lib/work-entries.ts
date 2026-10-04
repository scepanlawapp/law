import type {
  CaseReference,
  ClientReference,
  UserReference,
} from "./api-interfaces";

export type WorkEntryStatus =
  | "RUNNING"
  | "PROPOSED"
  | "CONFIRMED"
  | "BILLED"
  | "WRITTEN_OFF";
export type WorkEntryTreatment =
  | "RETAINER"
  | "AT"
  | "HOURLY"
  | "NON_BILLABLE"
  | "UNDECIDED";
export type WorkEntrySource =
  | "MANUAL"
  | "TIMER"
  | "QUICK_CAPTURE"
  | "TASK"
  | "EVENT"
  | "DEADLINE"
  | "ACTIVITY"
  | "EMAIL";
export type WorkEntrySourceType =
  | "TASK"
  | "EVENT"
  | "DEADLINE"
  | "CLIENT_ACTIVITY"
  | "CASE_ACTIVITY";
export type RetainerRule = "HOURLY" | "AT" | "ABSORBED";

export interface WorkEntry {
  id: string;
  user: UserReference;
  client: ClientReference;
  case: CaseReference | null;
  workDate: string;
  minutes: number | null;
  timerStartedAt: string | null;
  description: string;
  serviceCategory: { id: string; name: string } | null;
  treatment: WorkEntryTreatment;
  status: WorkEntryStatus;
  writeOffReason: string | null;
  source: WorkEntrySource;
  sourceType: WorkEntrySourceType | null;
  sourceId: string | null;
  statementId: string | null;
  aiParsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkEntryRequest {
  clientId: string;
  caseId?: string;
  workDate: string;
  minutes: number;
  description: string;
  serviceCategoryId?: string;
  treatment?: WorkEntryTreatment;
  source?: "MANUAL" | "QUICK_CAPTURE";
  aiParsed?: boolean;
}

export type UpdateWorkEntryRequest = Partial<CreateWorkEntryRequest>;

export interface WorkEntryQuery {
  userIds?: string[];
  clientIds?: string[];
  caseId?: string;
  statuses?: WorkEntryStatus[];
  treatments?: WorkEntryTreatment[];
  from?: string;
  to?: string;
  unbilledOnly?: boolean;
  page: number;
  pageSize: number;
}

export interface StartTimerRequest {
  clientId: string;
  caseId?: string;
  description?: string;
}

export interface ConfirmSourceEntryRequest {
  sourceType: WorkEntrySourceType;
  sourceId: string;
  minutes: number | null;
  description?: string;
}

export interface WorkCaptureParseRequest {
  text: string;
}

export interface WorkCaptureParseResponse {
  ok: boolean;
  clientId: string | null;
  clientCandidates: ClientReference[];
  caseId: string | null;
  caseCandidates: CaseReference[];
  minutes: number | null;
  serviceCategoryId: string | null;
  description: string | null;
}

export interface TimeReviewResponse {
  entries: WorkEntry[];
  proposed: WorkEntry[];
  missingEvents: {
    eventId: string;
    title: string;
    startsAt: string;
    endsAt: string;
    client: ClientReference | null;
    case: CaseReference | null;
  }[];
  untouchedClients: {
    client: ClientReference;
    reasons: ("ACTIVITY" | "DOCUMENT" | "CHAT")[];
  }[];
}

export interface ServiceCategory {
  id: string;
  name: string;
  active: boolean;
  order: number;
}

export interface RetainerAgreement {
  id: string;
  clientId: string;
  title: string;
  monthlyFee: string;
  currency: string;
  validFrom: string;
  validTo: string | null;
  includedMinutes: number | null;
  coveredCategoryIds: string[];
  overageRule: RetainerRule;
  overageHourlyRate: string | null;
  outOfScopeRule: RetainerRule;
  outOfScopeHourlyRate: string | null;
  active: boolean;
}

export type UpsertRetainerAgreementRequest = Omit<
  RetainerAgreement,
  "id" | "active"
>;

export interface ClientBillingProfile {
  clientId: string;
  hourlyRate: string | null;
  currency: string;
}

export interface UserRate {
  id: string;
  userId: string;
  hourlyValue: string;
  currency: string;
  effectiveFrom: string;
}

export interface WorkspaceBillingConfig {
  targetHourlyRate: string | null;
  internalCurrency: string;
  defaultVatRate: string;
  paymentTermDays: number;
}

export interface RetainerUsage {
  client: ClientReference;
  agreementId: string;
  month: string;
  currency: string;
  fee: string;
  includedMinutes: number | null;
  coveredMinutes: number;
  outOfScopeMinutes: number;
  effectiveHourlyRate: string | null;
  targetHourlyRate: string | null;
}

export interface MonthEndPrecheck {
  month: string;
  clients: { client: ClientReference; open: WorkEntry[] }[];
}

export interface MonthEndRunResult {
  month: string;
  statements: {
    statementId: string;
    client: ClientReference;
    currency: string;
    created: boolean;
    addedLines: number;
    pricingRequiredLines: number;
  }[];
}

export interface ProfitabilityRow {
  client: ClientReference;
  minutes: number;
  revenue: { currency: string; net: string }[];
  timeValue: string | null;
  unknownValueMinutes: number;
  effectiveHourlyRate: string | null;
  comparable: boolean;
  writtenOffValue: string | null;
  unbilledValue: string | null;
}

export interface ProfitabilityReport {
  from: string;
  to: string;
  internalCurrency: string;
  targetHourlyRate: string | null;
  rows: ProfitabilityRow[];
  byPerson: {
    user: UserReference;
    loggedMinutes: number;
    billedMinutes: number;
  }[];
}
