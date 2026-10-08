import { toLatin } from "@law/transliteration";
import {
  FACT_FIELDS,
  SUBJECT_TYPES,
  type FactKind,
  type SubjectType,
} from "./kinds";
import {
  digitsOnly,
  isValidJmbg,
  isValidMb,
  isValidPib,
  jmbgBirthDate,
} from "./identifiers";
import { foldForMatch, foldText, locateInFolded } from "./quotes";

/** One fact as the model reported it, flattened from its subject. */
export interface RawFact {
  subjectKey: string;
  subjectType: SubjectType;
  subjectRole: string | null;
  field: string;
  value: string;
  quote: string;
  confidence: number;
}

export interface ExtractedFact {
  subjectKey: string;
  subjectType: SubjectType;
  subjectRole: string | null;
  field: string;
  value: string;
  normalizedValue: string | null;
  quote: string;
  /** Offset of the quote in the original text. */
  charStart: number | null;
  confidence: number;
}

/** A quote shorter than this cannot verify anything. */
const MIN_QUOTE_CHARS = 3;

function isDateField(field: string): boolean {
  return field === "dateOfBirth" || field.endsWith("Date");
}

const IDENTIFIER_FIELDS: Record<
  string,
  { digits: number; valid: (digits: string) => boolean }
> = {
  jmbg: { digits: 13, valid: isValidJmbg },
  taxNumber: { digits: 9, valid: isValidPib },
  registrationNumber: { digits: 8, valid: isValidMb },
};

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function iso(year: number, month: number, day: number): string | null {
  if (!isCalendarDate(year, month, day)) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Folded (Latin, lower-case) month stems; genitive "januara" matches the stem.
const MONTH_STEMS = [
  "januar",
  "februar",
  "mart",
  "april",
  "maj",
  "jun",
  "jul",
  "avgust",
  "septembar",
  "oktobar",
  "novembar",
  "decembar",
];

/**
 * Every calendar date written in `text` as ISO strings. Understands
 * "01.01.1990.", "1.1.1990", "01. 01. 1990.", "01/01/1990", "1990-01-01" and
 * "1. januar 1990" / "1. januara 1990. godine". Impossible dates are skipped.
 */
function datesIn(text: string): Set<string> {
  const folded = foldForMatch(text);
  const found = new Set<string>();
  const add = (year: string, month: number, day: string) => {
    const value = iso(Number(year), month, Number(day));
    if (value) {
      found.add(value);
    }
  };
  for (const m of folded.matchAll(
    /(?<!\d)(\d{1,2}) ?[./-] ?(\d{1,2}) ?[./-] ?(\d{4})(?!\d)/g,
  )) {
    add(m[3], Number(m[2]), m[1]);
  }
  for (const m of folded.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) {
    add(m[1], Number(m[2]), m[3]);
  }
  const named = new RegExp(
    `(?<!\\d)(\\d{1,2}) ?\\.? ?(${MONTH_STEMS.join("|")})a? ?(\\d{4})(?!\\d)`,
    "g",
  );
  for (const m of folded.matchAll(named)) {
    add(m[3], MONTH_STEMS.indexOf(m[2]) + 1, m[1]);
  }
  return found;
}

const SEPARATORS = new Set([" ", "\u00a0", ".", "-", "/"]);

/**
 * True when `digits` is printed in `quote` as one run of digits (optionally
 * split by single spaces, dots, dashes or slashes) that is not part of a
 * longer run of digits.
 */
function printsDigitRun(quote: string, digits: string): boolean {
  const isDigit = (ch: string | undefined) =>
    ch !== undefined && ch >= "0" && ch <= "9";
  for (let start = 0; start < quote.length; start += 1) {
    if (!isDigit(quote[start])) {
      continue;
    }
    const before = quote[start - 1];
    if (
      isDigit(before) ||
      (before !== undefined &&
        SEPARATORS.has(before) &&
        isDigit(quote[start - 2]))
    ) {
      continue;
    }
    let matched = 0;
    let end = start;
    while (end < quote.length && matched < digits.length) {
      const ch = quote[end];
      if (isDigit(ch)) {
        if (ch !== digits[matched]) {
          break;
        }
        matched += 1;
      } else if (
        !(
          SEPARATORS.has(ch) &&
          isDigit(quote[end - 1]) &&
          isDigit(quote[end + 1])
        )
      ) {
        break;
      }
      end += 1;
    }
    const after = quote[end];
    const continues =
      isDigit(after) ||
      (after !== undefined && SEPARATORS.has(after) && isDigit(quote[end + 1]));
    if (matched === digits.length && !continues) {
      return true;
    }
  }
  return false;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * Keeps only verified facts: the field is allowed for the kind, the quote is
 * in the text, the value itself is printed in the quote (dates compared as
 * calendar dates, identifiers as one contiguous digit run), identifiers pass
 * their checksum, and a JMBG agrees with the subject's date of birth. Values
 * and quotes are stored in Latin; `charStart` is an offset in the original
 * `text`.
 */
export function normalizeFacts(
  raw: readonly RawFact[],
  text: string,
  kind: FactKind,
): ExtractedFact[] {
  const allowed: ReadonlySet<string> = new Set(FACT_FIELDS[kind]);
  const folded = foldText(text);
  const seen = new Set<string>();
  const facts: ExtractedFact[] = [];

  for (const item of raw) {
    const value = toLatin(item.value ?? "").trim();
    const quote = toLatin(item.quote ?? "").trim();
    const subjectKey = (item.subjectKey ?? "").trim();
    if (
      !allowed.has(item.field) ||
      !value ||
      !subjectKey ||
      !(SUBJECT_TYPES as readonly string[]).includes(item.subjectType)
    ) {
      continue;
    }
    const foldedQuote = foldForMatch(quote);
    const foldedValue = foldForMatch(value);
    if (foldedQuote.length < MIN_QUOTE_CHARS || !foldedValue) {
      continue;
    }
    const charStart = locateInFolded(folded, quote);
    if (charStart === null) {
      continue;
    }

    let normalizedValue: string | null = null;
    const identifier = IDENTIFIER_FIELDS[item.field];
    if (identifier) {
      const digits = digitsOnly(value);
      if (
        digits.length !== identifier.digits ||
        !identifier.valid(digits) ||
        !printsDigitRun(quote, digits)
      ) {
        continue;
      }
      normalizedValue = digits;
    } else if (isDateField(item.field)) {
      const valueDates = datesIn(value);
      if (valueDates.size !== 1) {
        continue;
      }
      normalizedValue = [...valueDates][0];
      if (!datesIn(quote).has(normalizedValue)) {
        continue;
      }
    } else if (
      foldedQuote.length < foldedValue.length ||
      !foldedQuote.includes(foldedValue)
    ) {
      continue;
    }

    const dedupeKey = `${subjectKey}\u0000${item.field}\u0000${normalizedValue ?? value}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    facts.push({
      subjectKey,
      subjectType: item.subjectType,
      subjectRole: item.subjectRole?.trim()
        ? toLatin(item.subjectRole.trim())
        : null,
      field: item.field,
      value,
      normalizedValue,
      quote,
      charStart,
      confidence: clamp01(item.confidence),
    });
  }

  return dropJmbgContradictingBirthDate(facts);
}

/** A JMBG encodes the birth date; if the same subject states another, drop it. */
function dropJmbgContradictingBirthDate(
  facts: ExtractedFact[],
): ExtractedFact[] {
  const birthDates = new Map<string, Set<string>>();
  for (const fact of facts) {
    if (fact.field === "dateOfBirth" && fact.normalizedValue) {
      const dates = birthDates.get(fact.subjectKey) ?? new Set<string>();
      dates.add(fact.normalizedValue);
      birthDates.set(fact.subjectKey, dates);
    }
  }
  return facts.filter((fact) => {
    if (fact.field !== "jmbg" || !fact.normalizedValue) {
      return true;
    }
    const dates = birthDates.get(fact.subjectKey);
    const encoded = jmbgBirthDate(fact.normalizedValue);
    return !dates || (encoded !== null && dates.has(encoded));
  });
}
