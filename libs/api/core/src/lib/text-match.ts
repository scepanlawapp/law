import { toLatin } from "@law/transliteration";

/** Lowercase Latin without diacritics, for name matching. */
export function normalize(value: string): string {
  return toLatin(value)
    .trim()
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Alphanumeric words of an already normalized string. */
export function tokens(value: string): string[] {
  return value.split(/[^a-z0-9]+/).filter(Boolean);
}
