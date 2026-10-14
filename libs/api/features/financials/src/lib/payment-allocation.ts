import {
  PaymentAllocationInput,
  PaymentAllocationMode,
} from "@law/api-interfaces";

export interface AllocationCandidate {
  id: string;
  remainingAmount: string;
  dateOfMaturity: string;
  dateOfCreate: string;
  invoiceNumber: string;
  externalInvoiceNumber?: string | null;
  externalReference?: string | null;
}
const cents = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
};
const decimal = (value: bigint) =>
  `${value / BigInt(100)}.${String(value % BigInt(100)).padStart(2, "0")}`;
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const normalize = (value: string) => value.trim().toLocaleLowerCase("sr-Latn");

/** Pure preview calculation. Inputs are scoped and validated by PaymentsService. */
export function allocatePayment(
  amount: string,
  candidates: AllocationCandidate[],
  mode: PaymentAllocationMode,
  reference?: string | null,
) {
  let remaining = cents(amount);
  const rows = [...candidates]
    .filter((i) => cents(i.remainingAmount) > BigInt(0))
    .sort(
      (a, b) =>
        compare(a.dateOfMaturity, b.dateOfMaturity) ||
        compare(a.dateOfCreate, b.dateOfCreate) ||
        compare(a.id, b.id),
    );
  let warning: string | null = null;
  if (mode === "AUTOMATIC" && reference?.trim()) {
    const matches = rows.filter((i) =>
      [i.invoiceNumber, i.externalInvoiceNumber, i.externalReference].some(
        (value) => value && normalize(value) === normalize(reference),
      ),
    );
    if (matches.length === 1)
      rows.unshift(...rows.splice(rows.indexOf(matches[0]), 1));
    else
      warning =
        matches.length > 1
          ? "Referenca odgovara većem broju faktura. Raspodela je predložena po dospeću."
          : "Nije pronađena faktura sa ovom referencom. Raspodela je predložena po dospeću.";
  }
  const amounts = new Map<string, bigint>();
  if (mode === "EQUAL") {
    let active = rows;
    while (remaining > BigInt(0) && active.length) {
      const share = remaining / BigInt(active.length);
      const extra = remaining % BigInt(active.length);
      for (const [index, row] of active.entries()) {
        const previous = amounts.get(row.id) ?? BigInt(0);
        const capacity = cents(row.remainingAmount) - previous;
        const wanted = share + (BigInt(index) < extra ? BigInt(1) : BigInt(0));
        const value = wanted < capacity ? wanted : capacity;
        amounts.set(row.id, previous + value);
        remaining -= value;
      }
      active = active.filter(
        (row) =>
          (amounts.get(row.id) ?? BigInt(0)) < cents(row.remainingAmount),
      );
    }
  } else {
    for (const row of rows) {
      const capacity = cents(row.remainingAmount);
      const value = remaining < capacity ? remaining : capacity;
      amounts.set(row.id, value);
      remaining -= value;
      if (!remaining) break;
    }
  }
  const allocations: PaymentAllocationInput[] = rows
    .filter((i) => (amounts.get(i.id) ?? BigInt(0)) > BigInt(0))
    .map((i) => ({
      invoiceId: i.id,
      amount: decimal(amounts.get(i.id) ?? BigInt(0)),
    }));
  return {
    allocations,
    allocatedAmount: decimal(cents(amount) - remaining),
    unallocatedAmount: decimal(remaining),
    warning,
  };
}
