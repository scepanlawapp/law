import {
  ReportAllocationCategory,
  ReportAllocationReason,
  ReportCollectionStatus,
  ReportDateBasis,
  ReportGroup,
  ReportSharing,
  ReportWorkStatus,
} from "../../../shared/models";

/** UI-only contracts. Amounts are integer RSD minor units, rates are basis points. */
export interface ReportMember {
  id: string;
  name: string;
  former: boolean;
}
export interface ReportAllocation {
  memberId: string;
  category: ReportAllocationCategory;
  rate: number;
  reason?: ReportAllocationReason;
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
  workStatus: ReportWorkStatus;
  estimated: number;
  invoice: { reference: string; date: string; amount: number } | null;
  payments: { date: string; amount: number }[];
  sharing: ReportSharing;
  allocations: ReportAllocation[];
}
export interface ReportDataset {
  members: ReportMember[];
  records: ReportRecord[];
}
export interface ReportFilters {
  from: string;
  to: string;
  basis: ReportDateBasis;
  member: string;
  client: string;
  caseId: string;
  status: string;
  sharing: string;
  workStatus: string;
  search: string;
  group: ReportGroup;
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
  status: ReportCollectionStatus;
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
