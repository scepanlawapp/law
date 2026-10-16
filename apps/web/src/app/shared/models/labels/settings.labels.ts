import {
  ExchangeRateSource,
  InvoiceNumberResetPolicy,
  PaymentMethodPreference,
  PaymentQrStandard,
  SefEnvironment,
  UserProfileGender,
  UserSettingsAccent,
  UserSettingsDateTimeFormat,
  UserSettingsFinish,
  UserSettingsLanguage,
  UserSettingsTheme,
} from "@law/api-interfaces";
import { OFFICE_TIME_ZONE } from "../locale";
import { LabelMap } from "../select-option";

export const THEME_LABELS: LabelMap<UserSettingsTheme> = {
  [UserSettingsTheme.MIDNIGHT]: "settings.themeMidnight",
  [UserSettingsTheme.DEEP_NAVY]: "settings.themeDeepNavy",
  [UserSettingsTheme.CHARCOAL]: "settings.themeCharcoal",
  [UserSettingsTheme.DARK_TEAL]: "settings.themeDarkTeal",
  [UserSettingsTheme.BURGUNDY]: "settings.themeBurgundy",
  [UserSettingsTheme.IVORY]: "settings.themeIvory",
};

export const ACCENT_LABELS: LabelMap<UserSettingsAccent> = {
  [UserSettingsAccent.GOLD]: "settings.accent.GOLD",
  [UserSettingsAccent.EMERALD]: "settings.accent.EMERALD",
  [UserSettingsAccent.ROYAL_BLUE]: "settings.accent.ROYAL_BLUE",
  [UserSettingsAccent.COPPER]: "settings.accent.COPPER",
  [UserSettingsAccent.ICE_BLUE]: "settings.accent.ICE_BLUE",
  [UserSettingsAccent.BURGUNDY]: "settings.accent.BURGUNDY",
  [UserSettingsAccent.PURPLE]: "settings.accent.PURPLE",
  [UserSettingsAccent.IVORY]: "settings.accent.IVORY",
};

export const FINISH_LABELS: LabelMap<UserSettingsFinish> = {
  [UserSettingsFinish.SOLID]: "settings.finish.SOLID",
  [UserSettingsFinish.METALLIC]: "settings.finish.METALLIC",
  [UserSettingsFinish.BRUSHED]: "settings.finish.BRUSHED",
  [UserSettingsFinish.MATTE]: "settings.finish.MATTE",
  [UserSettingsFinish.LUXURY]: "settings.finish.LUXURY",
};

export const LANGUAGE_LABELS: LabelMap<UserSettingsLanguage> = {
  [UserSettingsLanguage.SR]: "settings.serbian",
  [UserSettingsLanguage.EN]: "settings.english",
};

export const DATE_TIME_FORMAT_LABELS: LabelMap<UserSettingsDateTimeFormat> = {
  [UserSettingsDateTimeFormat.TWENTY_FOUR_HOUR]: "settings.twentyFourHour",
  [UserSettingsDateTimeFormat.TWELVE_HOUR]: "settings.twelveHour",
};

/** IANA time zones offered in the user settings. */
export const TIME_ZONE_LABELS: LabelMap<string> = {
  [OFFICE_TIME_ZONE]: "settings.belgrade",
  "Europe/London": "settings.london",
  "America/New_York": "settings.newYork",
};

export const GENDER_LABELS: LabelMap<UserProfileGender> = {
  [UserProfileGender.MALE]: "settings.genderMale",
  [UserProfileGender.FEMALE]: "settings.genderFemale",
};

export const INVOICE_NUMBER_RESET_POLICY_LABELS: LabelMap<InvoiceNumberResetPolicy> =
  {
    [InvoiceNumberResetPolicy.NEVER]: "settings.organization.numbering.never",
    [InvoiceNumberResetPolicy.YEARLY]: "settings.organization.numbering.yearly",
    [InvoiceNumberResetPolicy.MONTHLY]:
      "settings.organization.numbering.monthly",
  };

export const PAYMENT_METHOD_PREFERENCE_LABELS: LabelMap<PaymentMethodPreference> =
  {
    [PaymentMethodPreference.BANK_TRANSFER]:
      "settings.organization.payment.methods.BANK_TRANSFER",
    [PaymentMethodPreference.CASH]:
      "settings.organization.payment.methods.CASH",
    [PaymentMethodPreference.CARD]:
      "settings.organization.payment.methods.CARD",
    [PaymentMethodPreference.OTHER]:
      "settings.organization.payment.methods.OTHER",
  };

export const EXCHANGE_RATE_SOURCE_LABELS: LabelMap<ExchangeRateSource> = {
  [ExchangeRateSource.NBS_MIDDLE]:
    "settings.organization.currency.sources.NBS_MIDDLE",
  [ExchangeRateSource.NBS_BUY]:
    "settings.organization.currency.sources.NBS_BUY",
  [ExchangeRateSource.NBS_SELL]:
    "settings.organization.currency.sources.NBS_SELL",
  [ExchangeRateSource.MANUAL]: "settings.organization.currency.sources.MANUAL",
};

export const PAYMENT_QR_STANDARD_LABELS: LabelMap<PaymentQrStandard> = {
  [PaymentQrStandard.NBS_IPS]:
    "settings.organization.paymentQr.standards.NBS_IPS",
};

export const SEF_ENVIRONMENT_LABELS: LabelMap<SefEnvironment> = {
  [SefEnvironment.DEMO]: "settings.organization.sef.environments.DEMO",
  [SefEnvironment.PRODUCTION]:
    "settings.organization.sef.environments.PRODUCTION",
};
