import { PaymentMethod } from "@law/api-interfaces";
export const paymentMethodLabel = (value: PaymentMethod) =>
  ({
    BANK_TRANSFER: "Bankovni prenos",
    CASH: "Gotovina",
    CARD: "Kartica",
    OTHER: "Ostalo",
  })[value];
export const allocationLabel = (value: string) =>
  ({
    UNALLOCATED: "Neraspoređeno",
    PARTIAL: "Delimično raspoređeno",
    FULL: "Potpuno raspoređeno",
  })[value] ?? value;
export const collectionLabel = (value: string) =>
  ({
    UNPAID: "Nije plaćeno",
    PARTIALLY_PAID: "Delimično plaćeno",
    PAID: "Plaćeno",
  })[value] ?? value;
export const money = (value: string, currency: string) => {
  if (!/^-?\d+(\.\d{0,2})?$/.test(value)) return "—";
  const [whole, fraction = ""] = value.split(".");
  const integer = BigInt(whole);
  const parts = new Intl.NumberFormat("sr-Latn", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(integer);
  const formatted = parts
    .map((p) => (p.type === "fraction" ? fraction.padEnd(2, "0") : p.value))
    .join("");
  return value.startsWith("-") && integer === 0n ? "-" + formatted : formatted;
};
export const date = (value: string) =>
  new Intl.DateTimeFormat("sr-Latn", {
    dateStyle: "medium",
    timeZone: "Europe/Belgrade",
  }).format(new Date(value));
export const minor = (value: string): bigint =>
  /^\d{1,16}(\.\d{0,2})?$/.test(value)
    ? BigInt(value.split(".")[0]) * 100n +
      BigInt((value.split(".")[1] ?? "").padEnd(2, "0"))
    : 0n;
export const decimal = (value: bigint): string =>
  `${value < 0n ? "-" : ""}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, "0")}`;
export const paymentError = (error: unknown): string => {
  const body = (error as { error?: { message?: string | string[] } })?.error
    ?.message;
  return typeof body === "string"
    ? body
    : Array.isArray(body)
      ? body.join(" ")
      : "Podaci nisu sačuvani. Proverite vezu i pokušajte ponovo.";
};
