import { OFFICE_TIME_ZONE } from "../../shared/models";

export const money = (value: string, currency: string, locale: string) => {
  if (!/^-?\d+(\.\d{0,2})?$/.test(value)) return "—";
  const [whole, fraction = ""] = value.split(".");
  const integer = BigInt(whole);
  const parts = new Intl.NumberFormat(locale, {
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
export const date = (value: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: OFFICE_TIME_ZONE,
  }).format(new Date(value));
export const minor = (value: string): bigint =>
  /^\d{1,16}(\.\d{0,2})?$/.test(value)
    ? BigInt(value.split(".")[0]) * 100n +
      BigInt((value.split(".")[1] ?? "").padEnd(2, "0"))
    : 0n;
export const decimal = (value: bigint): string =>
  `${value < 0n ? "-" : ""}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, "0")}`;
/** The API's validation message, or the translated generic save error. */
export const paymentError = (
  error: unknown,
  translate: (key: string) => string,
): string => {
  const body = (error as { error?: { message?: string | string[] } })?.error
    ?.message;
  return typeof body === "string"
    ? body
    : Array.isArray(body)
      ? body.join(" ")
      : translate("payments.error.notSaved");
};
