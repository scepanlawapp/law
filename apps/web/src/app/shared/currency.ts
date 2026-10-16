import {
  SUPPORTED_PAYMENT_CURRENCIES,
  WorkEntryCurrency,
} from "@law/api-interfaces";
import {
  AllOptionValue,
  createSelectItemToString,
  filterOptionsFrom,
  LabelMap,
  optionsFrom,
  SelectOption,
} from "./models";

export type CurrencyCode = (typeof SUPPORTED_PAYMENT_CURRENCIES)[number];

/** The office's home currency: invoices, IPS QR and new payments default to it. */
export const DEFAULT_CURRENCY: CurrencyCode = "RSD";

/** Translation key per currency; covers payment and work-entry currencies. */
export const CURRENCY_LABELS: LabelMap<CurrencyCode | WorkEntryCurrency> = {
  RSD: "currency-rsd",
  EUR: "currency-eur",
  USD: "currency-usd",
  CHF: "currency-chf",
  GBP: "currency-gbp",
  JPY: "currency-jpy",
  CAD: "currency-cad",
  AUD: "currency-aud",
  CNY: "currency-cny",
  HKD: "currency-hkd",
  SGD: "currency-sgd",
  NZD: "currency-nzd",
  SEK: "currency-sek",
  NOK: "currency-nok",
  DKK: "currency-dkk",
  PLN: "currency-pln",
  CZK: "currency-czk",
  HUF: "currency-huf",
  RON: "currency-ron",
  BGN: "currency-bgn",
  TRY: "currency-try",
  AED: "currency-aed",
  SAR: "currency-sar",
  INR: "currency-inr",
  BRL: "currency-brl",
  MXN: "currency-mxn",
  ZAR: "currency-zar",
};

export const CURRENCY_OPTIONS: ReadonlyArray<SelectOption<CurrencyCode>> =
  optionsFrom(CURRENCY_LABELS, SUPPORTED_PAYMENT_CURRENCIES);

export const CURRENCY_FILTER_OPTIONS: ReadonlyArray<
  SelectOption<CurrencyCode | AllOptionValue>
> = filterOptionsFrom(
  CURRENCY_LABELS,
  "finance.all",
  SUPPORTED_PAYMENT_CURRENCIES,
);

export function createCurrencyItemToString(
  translate: (key: string) => string,
  includeAll = false,
): (value: string | null | undefined) => string {
  return createSelectItemToString(
    includeAll ? CURRENCY_FILTER_OPTIONS : CURRENCY_OPTIONS,
    translate,
  );
}
