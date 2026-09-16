import { getAlpha2Codes, getName, registerLocale } from "i18n-iso-countries";
import { toLatin } from "@law/transliteration";

export interface CountryOption {
  /** Uppercase ISO 3166-1 alpha-2 code, e.g. "RS". */
  readonly code: string;
  /** Country name localized to the requested language. */
  readonly name: string;
}

type CountryLocale = "sr" | "en";

const registeredLocales = new Set<CountryLocale>();
const alpha2Codes = Object.keys(getAlpha2Codes());

function toLocale(language: "SR" | "EN"): CountryLocale {
  return language === "EN" ? "en" : "sr";
}

async function ensureLocale(locale: CountryLocale): Promise<void> {
  if (registeredLocales.has(locale)) return;
  const data =
    locale === "en"
      ? await import("i18n-iso-countries/langs/en.json")
      : await import("i18n-iso-countries/langs/sr.json");
  registerLocale(data.default ?? data);
  registeredLocales.add(locale);
}

/** Loads (only once per locale) and returns the country list sorted by localized name. */
export async function loadCountryOptions(
  language: "SR" | "EN",
): Promise<CountryOption[]> {
  const locale = toLocale(language);
  await ensureLocale(locale);

  // i18n-iso-countries only ships Cyrillic Serbian names; the app uses Serbian Latin script.
  const toDisplayName = (name: string) =>
    locale === "sr" ? toLatin(name) : name;

  const options = alpha2Codes
    .map((code) => ({
      code,
      name: toDisplayName(getName(code, locale) ?? code),
    }))
    .filter((option): option is CountryOption => !!option.name);
  options.sort((a, b) => a.name.localeCompare(b.name, locale));
  return options;
}
