import {
  ChartDatum,
  MemberSummary,
  ReportDataset,
  ReportFilters,
  ReportRow,
  ReportTotals,
} from "./report-model";
/** Half-up rounding in minor units; independently rounded allocation differences always reconcile. */
export function allocate(amount: number, rate: number): number {
  return Number((BigInt(amount) * BigInt(rate) + BigInt(5000)) / BigInt(10000));
}
export function monthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split("-").map(Number);
  return {
    from: `${month}-01`,
    to: new Date(Date.UTC(year, m, 0)).toISOString().slice(0, 10),
  };
}
export function shiftMonth(month: string, offset: number): string {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function validRange(from: string, to: string): boolean {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s;
  return valid(from) && valid(to) && from <= to;
}
export function selectRows(
  data: ReportDataset,
  filters: ReportFilters,
): ReportRow[] {
  if (!validRange(filters.from, filters.to)) return [];
  const inRange = (date: string) => date >= filters.from && date <= filters.to;
  return data.records.flatMap((record): ReportRow[] => {
    const matchingPayments = record.payments.filter((p) => inRange(p.date));
    const date =
      filters.basis === "work"
        ? record.workDate
        : filters.basis === "invoice"
          ? record.invoice?.date
          : matchingPayments[0]?.date;
    if (!date || !inRange(date)) return [];
    const collectedAsOf = record.payments
      .filter((p) => p.date <= filters.to)
      .reduce((sum, p) => sum + p.amount, 0);
    const collected = (
      filters.basis === "collection"
        ? matchingPayments
        : record.payments.filter((p) => p.date <= filters.to)
    ).reduce((sum, p) => sum + p.amount, 0);
    const invoiced =
      record.invoice && record.invoice.date <= filters.to
        ? record.invoice.amount
        : 0;
    const balance = invoiced - collectedAsOf;
    const earnings = record.allocations.map((a) => ({
      ...a,
      invoiced: allocate(invoiced, a.rate),
      collected: allocate(collected, a.rate),
      potential: allocate(invoiced, a.rate) - allocate(collectedAsOf, a.rate),
    }));
    const shareInvoiced = earnings.reduce((s, a) => s + a.invoiced, 0);
    const shareCollected = earnings.reduce((s, a) => s + a.collected, 0);
    const status =
      record.sharing === "missing"
        ? "RequiresConfiguration"
        : !invoiced
          ? "NotInvoiced"
          : balance === 0
            ? "FullyCollected"
            : collectedAsOf > 0
              ? "PartiallyCollected"
              : "Uncollected";
    const row: ReportRow = {
      ...record,
      invoice:
        record.invoice && record.invoice.date <= filters.to
          ? record.invoice
          : null,
      date,
      invoiced,
      collected,
      collectedAsOf,
      balance,
      earnings,
      shareInvoiced,
      shareCollected,
      potential: earnings.reduce((s, a) => s + a.potential, 0),
      origination: earnings
        .filter((a) => a.category === "origination")
        .reduce((s, a) => s + a.collected, 0),
      eligibleCollected: record.sharing === "missing" ? 0 : collected,
      retained: record.sharing === "missing" ? 0 : collected - shareCollected,
      status,
    };
    if (
      filters.member &&
      row.performerId !== filters.member &&
      !row.allocations.some((a) => a.memberId === filters.member)
    )
      return [];
    if (
      (filters.client && row.clientId !== filters.client) ||
      (filters.caseId && row.caseId !== filters.caseId) ||
      (filters.status && row.status !== filters.status) ||
      (filters.sharing && row.sharing !== filters.sharing) ||
      (filters.workStatus && row.workStatus !== filters.workStatus)
    )
      return [];
    return [row];
  });
}
export function totals(rows: ReportRow[]): ReportTotals {
  const fields = [
    "invoiced",
    "collected",
    "eligibleCollected",
    "shareInvoiced",
    "shareCollected",
    "retained",
    "potential",
    "balance",
    "origination",
  ] as const;
  const result: ReportTotals = {
    invoiced: 0,
    collected: 0,
    eligibleCollected: 0,
    shareInvoiced: 0,
    shareCollected: 0,
    retained: 0,
    potential: 0,
    balance: 0,
    origination: 0,
    uninvoiced: 0,
    cases: 0,
  };
  for (const row of rows) {
    for (const field of fields) result[field] += row[field];
    if (!row.invoiced && row.workStatus === "completed")
      result.uninvoiced += row.estimated;
  }
  result.cases = new Set(
    rows
      .filter(
        (r) => r.balance > 0 || (!r.invoiced && r.workStatus === "completed"),
      )
      .map((r) => r.caseId),
  ).size;
  return result;
}
export function memberSummaries(
  data: ReportDataset,
  rows: ReportRow[],
): MemberSummary[] {
  return data.members
    .map((member) => {
      const ownWork = rows.filter((r) => r.performerId === member.id);
      const allocations = rows.flatMap((r) =>
        r.earnings.filter((a) => a.memberId === member.id),
      );
      return {
        ...member,
        invoiced: ownWork.reduce((s, r) => s + r.invoiced, 0),
        collected: ownWork.reduce((s, r) => s + r.collected, 0),
        shareInvoiced: allocations.reduce((s, a) => s + a.invoiced, 0),
        shareCollected: allocations.reduce((s, a) => s + a.collected, 0),
        potential: allocations.reduce((s, a) => s + a.potential, 0),
        origination: allocations
          .filter((a) => a.category === "origination")
          .reduce((s, a) => s + a.collected, 0),
      };
    })
    .filter((m) =>
      rows.some(
        (r) =>
          r.performerId === m.id || r.earnings.some((a) => a.memberId === m.id),
      ),
    );
}
export function timeline(
  rows: ReportRow[],
  group: ReportFilters["group"],
  earnings = false,
): ChartDatum[] {
  const buckets = new Map<string, ChartDatum>();
  for (const row of rows) {
    let label = row.date;
    if (group === "month") label = label.slice(0, 7);
    if (group === "week") {
      const d = new Date(label);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      label = d.toISOString().slice(0, 10);
    }
    const bucket = buckets.get(label) ?? { label, first: 0, second: 0 };
    bucket.first += earnings
      ? row.shareCollected - row.origination
      : row.invoiced;
    bucket.second =
      (bucket.second ?? 0) + (earnings ? row.origination : row.collected);
    buckets.set(label, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
}
export function aging(rows: ReportRow[], asOf: string): ChartDatum[] {
  const buckets = [
    "report.age.0",
    "report.age.1",
    "report.age.2",
    "report.age.3",
  ].map((label) => ({ label, first: 0 }));
  for (const row of rows) {
    if (!row.invoice || !row.balance) continue;
    const days = Math.floor(
      (Date.parse(asOf) - Date.parse(row.invoice.date)) / 86400000,
    );
    buckets[days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3].first +=
      row.balance;
  }
  return buckets;
}
/** Remove other beneficiaries BEFORE aggregation/presentation. Own work totals are kept separately in memberSummaries. */
export function scopePersonal(
  data: ReportDataset,
  viewerId: string,
): ReportDataset {
  return {
    members: data.members.filter((m) => m.id === viewerId),
    records: data.records
      .filter(
        (r) =>
          r.performerId === viewerId ||
          r.allocations.some((a) => a.memberId === viewerId),
      )
      .map((r) => ({
        ...r,
        performerId: r.performerId === viewerId ? viewerId : "other",
        allocations: r.allocations.filter((a) => a.memberId === viewerId),
      })),
  };
}
