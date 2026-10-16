import {
  UserSettingsAccent,
  UserSettingsFinish,
  UserSettingsTheme,
} from "@law/api-interfaces";
import {
  ACCENT_CSS_VALUES,
  FINISH_CSS_VALUES,
  THEME_CSS_VALUES,
} from "../../shared/models";

export const DEFAULT_THEME: UserSettingsTheme = UserSettingsTheme.CHARCOAL;
export const DEFAULT_ACCENT: UserSettingsAccent = UserSettingsAccent.GOLD;
export const DEFAULT_FINISH: UserSettingsFinish = UserSettingsFinish.METALLIC;

const THEME_VALUES: readonly UserSettingsTheme[] =
  Object.values(UserSettingsTheme);
const ACCENT_VALUES: readonly UserSettingsAccent[] =
  Object.values(UserSettingsAccent);
const FINISH_VALUES: readonly UserSettingsFinish[] =
  Object.values(UserSettingsFinish);

/** Preview swatch colour of each theme in the theme picker. */
export const THEME_SWATCHES: Readonly<Record<UserSettingsTheme, string>> = {
  [UserSettingsTheme.MIDNIGHT]: "#0f172a",
  [UserSettingsTheme.DEEP_NAVY]: "#1d3557",
  [UserSettingsTheme.CHARCOAL]: "#334155",
  [UserSettingsTheme.DARK_TEAL]: "#164e63",
  [UserSettingsTheme.BURGUNDY]: "#7f1d1d",
  [UserSettingsTheme.IVORY]: "#f3efe6",
};

/** Preview swatch colour of each accent in the accent picker. */
export const ACCENT_SWATCHES: Readonly<Record<UserSettingsAccent, string>> = {
  [UserSettingsAccent.GOLD]: "#c9a45c",
  [UserSettingsAccent.EMERALD]: "#1f8a70",
  [UserSettingsAccent.ROYAL_BLUE]: "#3478f6",
  [UserSettingsAccent.COPPER]: "#c47a44",
  [UserSettingsAccent.ICE_BLUE]: "#76c7e8",
  [UserSettingsAccent.BURGUNDY]: "#7a263a",
  [UserSettingsAccent.PURPLE]: "#8b5cf6",
  [UserSettingsAccent.IVORY]: "#f3efe6",
};

export function normalizeTheme(value: unknown): UserSettingsTheme {
  return isOneOf(THEME_VALUES, value) ? value : DEFAULT_THEME;
}

export function normalizeAccent(value: unknown): UserSettingsAccent {
  return isOneOf(ACCENT_VALUES, value) ? value : DEFAULT_ACCENT;
}

export function normalizeFinish(value: unknown): UserSettingsFinish {
  return isOneOf(FINISH_VALUES, value) ? value : DEFAULT_FINISH;
}

export function toCssTheme(value: unknown): string {
  return THEME_CSS_VALUES[normalizeTheme(value)];
}

export function toCssAccent(value: unknown): string {
  return ACCENT_CSS_VALUES[normalizeAccent(value)];
}

export function toCssFinish(value: unknown): string {
  return FINISH_CSS_VALUES[normalizeFinish(value)];
}

function isOneOf<T extends string>(
  values: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && values.includes(value as T);
}
