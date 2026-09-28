export type BillingEntryDialogValidationValue = {
  kind: "TIME" | "FIXED_FEE" | "EXPENSE";
  workStartDate: string;
  workEndDate: string;
  durationMinutes: number | null;
  amount: number | null;
  disposition: "BILLABLE" | "INCLUDED" | "NO_CHARGE" | "INTERNAL";
  noChargeReason: string;
};

export function billingEntryValidationKey(
  value: BillingEntryDialogValidationValue,
): string | null {
  if (value.workEndDate < value.workStartDate) {
    return "finance.invalidWorkPeriod";
  }

  if (
    value.kind === "TIME" &&
    (value.durationMinutes === null || value.durationMinutes <= 0)
  ) {
    return "finance.positiveDuration";
  }

  if (
    value.disposition === "BILLABLE" &&
    (value.amount === null || value.amount <= 0)
  ) {
    return "finance.billableAmount";
  }

  if (
    (value.disposition === "INCLUDED" || value.disposition === "NO_CHARGE") &&
    ((value.amount ?? 0) !== 0 || !value.noChargeReason.trim())
  ) {
    return "finance.zeroAmountReason";
  }

  return null;
}

export function toDateInputValue(
  value?: string,
  fallbackDate = new Date(),
): string {
  if (value) return value.slice(0, 10);

  const year = fallbackDate.getFullYear();
  const month = String(fallbackDate.getMonth() + 1).padStart(2, "0");
  const day = String(fallbackDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
