import type { CaseTimelineEvent } from "@law/api-interfaces";

const DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const QUOTE_MAX_CHARS = 300;

/**
 * Accepts YYYY-MM-DD, YYYY-MM or YYYY with a real calendar value; anything
 * else (free text, impossible dates) becomes null so it is never shown as a
 * date the document did not give.
 */
export function normalizeTimelineDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = DATE_PATTERN.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  if (year < 1900 || year > 2100) return null;
  if (!match[2]) return match[1];
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  if (!match[3]) return `${match[1]}-${match[2]}`;
  const day = Number(match[3]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Lowercase, diacritic- and punctuation-insensitive form for matching. */
export function foldForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/ž/g, "z")
    .replace(/š/g, "s")
    .replace(/đ/g, "dj")
    .replace(/[„“”"'‘’«»]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The quote only when it really occurs in the source text (ignoring case,
 * diacritics, punctuation and line breaks); otherwise null.
 */
export function verifyQuote(
  quote: unknown,
  sourceText: string,
  foldedSource: string = foldForMatch(sourceText),
): string | null {
  if (typeof quote !== "string") return null;
  const trimmed = quote.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  const clipped =
    trimmed.length > QUOTE_MAX_CHARS
      ? `${trimmed.slice(0, QUOTE_MAX_CHARS - 1)}…`
      : trimmed;
  const needle = foldForMatch(trimmed.slice(0, QUOTE_MAX_CHARS));
  if (needle.length < 8) return null;
  return foldedSource.includes(needle) ? clipped : null;
}

function sortKey(date: string | null): string {
  if (!date) return "9999-99-99";
  const [year, month = "00", day = "00"] = date.split("-");
  return `${year}-${month}-${day}`;
}

/**
 * Removes duplicates (same date and title, ignoring case and diacritics) and
 * sorts chronologically; a partial date sorts before full dates of its
 * period, undated events go last, and ties keep their extraction order.
 */
export function mergeTimelineEvents(
  events: readonly CaseTimelineEvent[],
): CaseTimelineEvent[] {
  const seen = new Map<string, CaseTimelineEvent>();
  for (const event of events) {
    const key = `${event.date ?? event.dateText ?? ""}|${foldForMatch(event.title)}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, event);
    } else if (!existing.quote && event.quote) {
      seen.set(key, event);
    }
  }
  return [...seen.values()]
    .map((event, index) => ({ event, index }))
    .sort(
      (left, right) =>
        sortKey(left.event.date).localeCompare(sortKey(right.event.date)) ||
        left.index - right.index,
    )
    .map(({ event }) => event);
}

/**
 * Splits text into windows of `windowChars`, up to `maxChars` in total,
 * breaking on a line or sentence end near the window edge when possible.
 */
export function splitIntoWindows(
  text: string,
  windowChars: number,
  maxChars: number,
): { windows: string[]; truncated: boolean } {
  const source = text.trim();
  const limit = Math.min(source.length, maxChars);
  const windows: string[] = [];
  let start = 0;
  while (start < limit) {
    let end = Math.min(start + windowChars, limit);
    if (end < limit) {
      const slice = source.slice(start, end);
      const breakAt = Math.max(
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
      );
      if (breakAt > windowChars * 0.6) end = start + breakAt + 1;
    }
    windows.push(source.slice(start, end));
    start = end;
  }
  return { windows, truncated: source.length > maxChars };
}
