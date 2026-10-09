/** UI-only contracts. Amounts are integer RSD minor units, rates are basis points. */
export type DateBasis = "work" | "invoice" | "collection";
export type ReportStatus =
  | "NotInvoiced"
  | "PartiallyCollected"
  | "Uncollected"
  | "FullyCollected"
  | "RequiresConfiguration";
export type AllocationCategory = "workShare" | "origination" | "contractual";
export interface ReportMember {
  id: string;
  name: string;
  former: boolean;
}
export interface ReportAllocation {
  memberId: string;
  category: AllocationCategory;
  rate: number;
  reason?: "ownClient" | "otherClient" | "origination" | "contractual";
}
export interface ReportRecord {
  id: string;
  performerId: string;
  clientId: string;
  client: string;
  caseId: string;
  caseName: string;
  titleKey: string;
  workDate: string;
  workStatus: "completed" | "planned";
  estimated: number;
  invoice: { reference: string; date: string; amount: number } | null;
  payments: { date: string; amount: number }[];
  sharing: "configured" | "excluded" | "missing";
  allocations: ReportAllocation[];
}
export interface ReportDataset {
  members: ReportMember[];
  records: ReportRecord[];
}
export interface ReportFilters {
  from: string;
  to: string;
  basis: DateBasis;
  member: string;
  client: string;
  caseId: string;
  status: string;
  sharing: string;
  workStatus: string;
  search: string;
  group: "day" | "week" | "month";
}
export interface ReportRow extends ReportRecord {
  date: string;
  invoiced: number;
  collected: number;
  collectedAsOf: number;
  balance: number;
  shareInvoiced: number;
  shareCollected: number;
  potential: number;
  origination: number;
  eligibleCollected: number;
  retained: number;
  status: ReportStatus;
  earnings: (ReportAllocation & {
    invoiced: number;
    collected: number;
    potential: number;
  })[];
}
export interface MemberSummary extends ReportMember {
  invoiced: number;
  collected: number;
  shareInvoiced: number;
  shareCollected: number;
  potential: number;
  origination: number;
}
export interface ChartDatum {
  label: string;
  first: number;
  second?: number;
  route?: string[];
}
export interface ReportTotals {
  invoiced: number;
  collected: number;
  eligibleCollected: number;
  shareInvoiced: number;
  shareCollected: number;
  retained: number;
  potential: number;
  uninvoiced: number;
  balance: number;
  cases: number;
  origination: number;
}
