import {
  CURRENCY_OPTIONS,
  Currency,
  createCurrencyItemToString,
} from "./currency";

describe("currency options", () => {
  it("preserves the supported currency order", () => {
    expect(CURRENCY_OPTIONS.map((option) => option.value)).toEqual([
      "RSD",
      "EUR",
      "USD",
      "CHF",
      "GBP",
      "JPY",
      "CAD",
      "AUD",
      "CNY",
      "HKD",
      "SGD",
      "NZD",
      "SEK",
      "NOK",
      "DKK",
      "PLN",
      "CZK",
      "HUF",
      "RON",
      "BGN",
      "TRY",
      "AED",
      "SAR",
      "INR",
      "BRL",
      "MXN",
      "ZAR",
    ]);
  });

  it("uses enum localization keys for selected display values", () => {
    const itemToString = createCurrencyItemToString((key) => `t:${key}`);

    expect(itemToString("RSD")).toBe(`t:${Currency.RSD}`);
    expect(itemToString("EUR")).toBe(`t:${Currency.EUR}`);
  });
});
