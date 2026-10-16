import { UserSettingsLanguage } from "@law/api-interfaces";

export const DEFAULT_LANGUAGE: UserSettingsLanguage = UserSettingsLanguage.SR;

/** BCP 47 locale for `Intl` date/number formatting per UI language. */
export const INTL_LOCALES: Readonly<Record<UserSettingsLanguage, string>> = {
  [UserSettingsLanguage.SR]: "sr-Latn-RS",
  [UserSettingsLanguage.EN]: "en-GB",
};

/** BCP 47 tag the browser's speech engine recognises per UI language. */
export const SPEECH_RECOGNITION_LOCALES: Readonly<
  Record<UserSettingsLanguage, string>
> = {
  [UserSettingsLanguage.SR]: "sr-RS",
  [UserSettingsLanguage.EN]: "en-US",
};

/** Stored invoice-language code; invoices default to Serbian Latin. */
export const DEFAULT_INVOICE_LANGUAGE = "sr-Latn";

/** Translation catalog file name under `public/i18n`. */
export const TRANSLATION_FILES: Readonly<Record<UserSettingsLanguage, string>> =
  {
    [UserSettingsLanguage.SR]: "ser",
    [UserSettingsLanguage.EN]: "eng",
  };

/** Locale code used by `i18n-iso-countries`. */
export const COUNTRY_LOCALES = {
  [UserSettingsLanguage.SR]: "sr",
  [UserSettingsLanguage.EN]: "en",
} as const satisfies Record<UserSettingsLanguage, string>;
export type CountryLocale =
  (typeof COUNTRY_LOCALES)[keyof typeof COUNTRY_LOCALES];

/** Belgrade is the office time zone for every business date the app shows. */
export const OFFICE_TIME_ZONE = "Europe/Belgrade";

export function intlLocale(language: UserSettingsLanguage): string {
  return INTL_LOCALES[language];
}
