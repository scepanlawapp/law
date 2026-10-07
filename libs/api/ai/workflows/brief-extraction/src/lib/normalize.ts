import {
  BRIEF_MISSING_FIELD_KEYS,
  BriefEvidenceItem,
  BriefMissingField,
  BriefMissingFieldKey,
} from "@law/api-interfaces";

const KEYS = new Set<string>(BRIEF_MISSING_FIELD_KEYS);
const IDENTIFIER = /^[a-z][A-Za-z\d]*$/;

// Legacy free-form names (schema paths, snake_case) mapped to canonical keys.
const ALIASES: Record<string, BriefMissingFieldKey> = {
  "plaintiff.name": "plaintiffName",
  "plaintiff.address": "plaintiffAddress",
  "plaintiff.jmbg": "plaintiffIdNumber",
  "defendant.name": "defendantName",
  "defendant.address": "defendantAddress",
  "defendant.jmbg": "defendantIdNumber",
  competentcourt: "competentCourt",
  claimvalue: "claimValue",
  legalbasis: "legalBasis",
  factualdescription: "factualDescription",
  reliefsought: "reliefSought",
};

const DEFAULT_LABELS: Record<BriefMissingFieldKey, string> = {
  plaintiffName: "Ime tužioca",
  plaintiffAddress: "Adresa tužioca",
  plaintiffIdNumber: "JMBG / matični broj tužioca",
  defendantName: "Naziv tuženog",
  defendantAddress: "Adresa tuženog",
  defendantIdNumber: "Matični broj tuženog",
  competentCourt: "Nadležni sud",
  claimValue: "Vrednost predmeta spora",
  legalBasis: "Pravni osnov",
  factualDescription: "Činjenični opis",
  reliefSought: "Tužbeni zahtev",
  serviceDate: "Datum dostavljanja osporenog akta",
  contractReference: "Broj i datum ugovora",
  other: "Podatak",
};

export function defaultMissingFieldLabel(key: BriefMissingFieldKey): string {
  return DEFAULT_LABELS[key];
}

/**
 * Normalizes missing-field items. `allowed` limits keys to one document type
 * (others become "other"); the default is the lawsuit set, and `null` keeps
 * any camelCase key so a later per-type pass can decide.
 */
export function normalizeMissingFields(
  value: unknown,
  allowed: ReadonlySet<string> | null = KEYS,
): BriefMissingField[] {
  if (!Array.isArray(value)) return [];
  const result: BriefMissingField[] = [];
  for (const item of value) {
    const field = normalizeMissingField(item, allowed);
    if (field) result.push(field);
  }
  return result;
}

export function normalizeEvidence(value: unknown): BriefEvidenceItem[] {
  if (!Array.isArray(value)) return [];
  const result: BriefEvidenceItem[] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const label = item.trim();
      if (label) result.push({ label, provided: false });
      continue;
    }
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const label = typeof record["label"] === "string" ? record["label"].trim() : "";
      if (label) result.push({ label, provided: record["provided"] === true });
    }
  }
  return result;
}

function normalizeMissingField(
  item: unknown,
  allowed: ReadonlySet<string> | null,
): BriefMissingField | null {
  if (typeof item === "string") {
    const raw = item.trim();
    if (!raw) return null;
    const key = resolveKey(raw, allowed);
    return { key, label: defaultLabel(key) ?? humanize(raw) };
  }
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const rawKey = typeof record["key"] === "string" ? record["key"].trim() : "";
  const rawLabel =
    typeof record["label"] === "string" ? record["label"].trim() : "";
  const key = rawKey ? resolveKey(rawKey, allowed) : "other";
  // An unrecognized key is still meaningful text when the label is missing.
  const fallback =
    defaultLabel(key) ??
    (key === "other" && rawKey && rawKey !== "other" ? humanize(rawKey) : "");
  const label = rawLabel ? humanize(rawLabel) : fallback;
  if (label) return { key, label };
  // Untyped pass: keep the key; the per-type pass fills the label.
  return !allowed && key !== "other" ? { key, label: "" } : null;
}

function resolveKey(raw: string, allowed: ReadonlySet<string> | null): string {
  if (allowed?.has(raw)) return raw;
  const legacy = keyFromLegacy(raw);
  if (legacy !== "other" && (!allowed || allowed.has(legacy))) return legacy;
  if (!allowed && IDENTIFIER.test(raw)) return raw;
  return "other";
}

function defaultLabel(key: string): string | null {
  return key !== "other" && KEYS.has(key)
    ? DEFAULT_LABELS[key as BriefMissingFieldKey]
    : null;
}

function keyFromLegacy(raw: string): BriefMissingFieldKey {
  if (KEYS.has(raw)) return raw as BriefMissingFieldKey;
  const lower = raw.toLowerCase();
  const alias = ALIASES[lower];
  if (alias) return alias;
  const plain = stripDiacritics(lower);
  if (
    plain.includes("datum") &&
    (plain.includes("dostav") || plain.includes("prijem"))
  )
    return "serviceDate";
  if (plain.includes("jmbg") || plain.includes("maticni")) {
    return plain.includes("tuzen") || plain.includes("defendant")
      ? "defendantIdNumber"
      : "plaintiffIdNumber";
  }
  return "other";
}

// Identifiers ("datum_dostavljanja_resenja", "opposingParty") become sentence
// case; natural phrases only get a capital first letter.
export function humanize(raw: string): string {
  const value = raw.trim();
  const identifier =
    /^[\p{L}\d]+([_.][\p{L}\d]+)+$/u.test(value) ||
    /^[a-z]+([A-Z][a-z\d]*)+$/.test(value);
  const text = identifier
    ? value
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/[_.]+/g, " ")
        .toLowerCase()
    : value.replace(/\s+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function stripDiacritics(value: string): string {
  return value
    .replace(/[čć]/g, "c")
    .replace(/ž/g, "z")
    .replace(/š/g, "s")
    .replace(/đ/g, "dj");
}
