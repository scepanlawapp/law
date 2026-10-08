import { toLatin } from "@law/transliteration";
import {
  DATE_FIELDS,
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
import { locateQuote } from "./quotes";

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

const ALL_FIELDS: ReadonlySet<string> = new Set(
  Object.values(FACT_FIELDS).flat(),
);

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

/** "01.01.1990.", "1. 1. 1990", "01/01/1990", "1990-01-01" -> "1990-01-01". */
function normalizeDate(value: string): string | null {
  const text = value.trim();
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (isoMatch) {
    return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }
  const dmy =
    /^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4})\s*\.?(?:\s*god(?:ine|\.)?)?$/i.exec(
      text,
    );
  return dmy ? iso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1])) : null;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * Keeps only verified facts: the field is allowed for the kind, the quote is
 * in the text, identifiers pass their checksum and are printed in the quote,
 * and a JMBG agrees with the subject's date of birth. Values and quotes are
 * stored in Latin; `charStart` is an offset in the original `text`.
 *
 * Without `kind`, any known field of any kind is accepted.
 */
export function normalizeFacts(
  raw: readonly RawFact[],
  text: string,
  kind?: FactKind,
): ExtractedFact[] {
  const allowed: ReadonlySet<string> = kind
    ? new Set(FACT_FIELDS[kind])
    : ALL_FIELDS;
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
    const charStart = locateQuote(text, quote);
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
        !digitsOnly(quote).includes(digits)
      ) {
        continue;
      }
      normalizedValue = digits;
    } else if (DATE_FIELDS.has(item.field)) {
      normalizedValue = normalizeDate(value);
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
