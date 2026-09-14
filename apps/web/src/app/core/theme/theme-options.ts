import {
  UserSettingsAccent,
  UserSettingsFinish,
  UserSettingsTheme,
} from "@law/api-interfaces";

export const DEFAULT_THEME: UserSettingsTheme = "MIDNIGHT";
export const DEFAULT_ACCENT: UserSettingsAccent = "GOLD";
export const DEFAULT_FINISH: UserSettingsFinish = "SOLID";

export const THEME_VALUES: readonly UserSettingsTheme[] = [
  "MIDNIGHT",
  "DEEP_NAVY",
  "CHARCOAL",
  "DARK_TEAL",
  "BURGUNDY",
  "IVORY",
];

export const ACCENT_VALUES: readonly UserSettingsAccent[] = [
  "GOLD",
  "EMERALD",
  "ROYAL_BLUE",
  "COPPER",
  "ICE_BLUE",
  "BURGUNDY",
  "PURPLE",
  "IVORY",
];

export const FINISH_VALUES: readonly UserSettingsFinish[] = [
  "SOLID",
  "METALLIC",
  "BRUSHED",
  "MATTE",
  "LUXURY",
];

export const ACCENT_SWATCHES: ReadonlyArray<{
  name: UserSettingsAccent;
  value: string;
}> = [
  { name: "GOLD", value: "#c9a45c" },
  { name: "EMERALD", value: "#1f8a70" },
  { name: "ROYAL_BLUE", value: "#3478f6" },
  { name: "COPPER", value: "#c47a44" },
  { name: "ICE_BLUE", value: "#76c7e8" },
  { name: "BURGUNDY", value: "#7a263a" },
  { name: "PURPLE", value: "#8b5cf6" },
  { name: "IVORY", value: "#f3efe6" },
];

export function normalizeTheme(value: unknown): UserSettingsTheme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

export function normalizeAccent(value: unknown): UserSettingsAccent {
  return isAccent(value) ? value : DEFAULT_ACCENT;
}

export function normalizeFinish(value: unknown): UserSettingsFinish {
  return isFinish(value) ? value : DEFAULT_FINISH;
}

export function toCssTheme(value: unknown): string {
  return normalizeTheme(value).toLowerCase().replace(/_/g, "-");
}

export function toCssAccent(value: unknown): string {
  return normalizeAccent(value).toLowerCase().replace(/_/g, "-");
}

export function toCssFinish(value: unknown): string {
  return normalizeFinish(value).toLowerCase().replace(/_/g, "-");
}

function isTheme(value: unknown): value is UserSettingsTheme {
  return (
    typeof value === "string" &&
    THEME_VALUES.includes(value as UserSettingsTheme)
  );
}

function isAccent(value: unknown): value is UserSettingsAccent {
  return (
    typeof value === "string" &&
    ACCENT_VALUES.includes(value as UserSettingsAccent)
  );
}

function isFinish(value: unknown): value is UserSettingsFinish {
  return (
    typeof value === "string" &&
    FINISH_VALUES.includes(value as UserSettingsFinish)
  );
}
