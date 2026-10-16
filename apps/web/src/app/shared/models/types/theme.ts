import {
  UserSettingsAccent,
  UserSettingsFinish,
  UserSettingsTheme,
} from "@law/api-interfaces";

/** `data-theme` attribute values the stylesheets select on. */
export const THEME_CSS_VALUES: Readonly<Record<UserSettingsTheme, string>> = {
  [UserSettingsTheme.MIDNIGHT]: "midnight",
  [UserSettingsTheme.DEEP_NAVY]: "deep-navy",
  [UserSettingsTheme.CHARCOAL]: "charcoal",
  [UserSettingsTheme.DARK_TEAL]: "dark-teal",
  [UserSettingsTheme.BURGUNDY]: "burgundy",
  [UserSettingsTheme.IVORY]: "ivory",
};

/** `data-accent` attribute values the stylesheets select on. */
export const ACCENT_CSS_VALUES: Readonly<Record<UserSettingsAccent, string>> = {
  [UserSettingsAccent.GOLD]: "gold",
  [UserSettingsAccent.EMERALD]: "emerald",
  [UserSettingsAccent.ROYAL_BLUE]: "royal-blue",
  [UserSettingsAccent.COPPER]: "copper",
  [UserSettingsAccent.ICE_BLUE]: "ice-blue",
  [UserSettingsAccent.BURGUNDY]: "burgundy",
  [UserSettingsAccent.PURPLE]: "purple",
  [UserSettingsAccent.IVORY]: "ivory",
};

/** `data-finish` attribute values the stylesheets select on. */
export const FINISH_CSS_VALUES: Readonly<Record<UserSettingsFinish, string>> = {
  [UserSettingsFinish.SOLID]: "solid",
  [UserSettingsFinish.METALLIC]: "metallic",
  [UserSettingsFinish.BRUSHED]: "brushed",
  [UserSettingsFinish.MATTE]: "matte",
  [UserSettingsFinish.LUXURY]: "luxury",
};
