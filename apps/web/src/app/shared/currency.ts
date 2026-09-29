import { createSelectItemToString, SelectOption } from "./utils";

export enum Currency {
  RSD = "currency-rsd",
  EUR = "currency-eur",
  USD = "currency-usd",
  CHF = "currency-chf",
  GBP = "currency-gbp",
  JPY = "currency-jpy",
  CAD = "currency-cad",
  AUD = "currency-aud",
  CNY = "currency-cny",
  HKD = "currency-hkd",
  SGD = "currency-sgd",
  NZD = "currency-nzd",
  SEK = "currency-sek",
  NOK = "currency-nok",
  DKK = "currency-dkk",
  PLN = "currency-pln",
  CZK = "currency-czk",
  HUF = "currency-huf",
  RON = "currency-ron",
  BGN = "currency-bgn",
  TRY = "currency-try",
  AED = "currency-aed",
  SAR = "currency-sar",
  INR = "currency-inr",
  BRL = "currency-brl",
  MXN = "currency-mxn",
  ZAR = "currency-zar",
}

export type CurrencyCode = keyof typeof Currency;

export const CURRENCY_OPTIONS: ReadonlyArray<SelectOption<CurrencyCode>> =
  Object.entries(Currency).map(([value, label]) => ({
    value: value as CurrencyCode,
    label,
  }));

export const CURRENCY_FILTER_OPTIONS: ReadonlyArray<
  SelectOption<CurrencyCode | "">
> = [{ value: "", label: "finance.all" }, ...CURRENCY_OPTIONS];

export function createCurrencyItemToString(
  translate: (key: string) => string,
  includeAll = false,
): (value: string | null | undefined) => string {
  return createSelectItemToString(
    includeAll ? CURRENCY_FILTER_OPTIONS : CURRENCY_OPTIONS,
    translate,
  );
}
