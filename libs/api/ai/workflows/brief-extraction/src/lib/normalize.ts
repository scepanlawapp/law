import {
  BRIEF_MISSING_FIELD_KEYS,
  BriefEvidenceItem,
  BriefMissingField,
  BriefMissingFieldKey,
} from "@law/api-interfaces";

const KEYS = new Set<string>(BRIEF_MISSING_FIELD_KEYS);

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

export function normalizeMissingFields(value: unknown): BriefMissingField[] {
  if (!Array.isArray(value)) return [];
  const result: BriefMissingField[] = [];
  for (const item of value) {
    const field = normalizeMissingField(item);
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

function normalizeMissingField(item: unknown): BriefMissingField | null {
  if (typeof item === "string") {
    const raw = item.trim();
    if (!raw) return null;
    const key = keyFromLegacy(raw);
    return {
      key,
      label: key === "other" ? humanize(raw) : DEFAULT_LABELS[key],
    };
  }
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const rawKey = typeof record["key"] === "string" ? record["key"].trim() : "";
  const rawLabel =
    typeof record["label"] === "string" ? record["label"].trim() : "";
  const key: BriefMissingFieldKey = KEYS.has(rawKey)
    ? (rawKey as BriefMissingFieldKey)
    : rawKey
      ? keyFromLegacy(rawKey)
      : "other";
  // An unrecognized key is still meaningful text when the label is missing.
  const fallback =
    key !== "other"
      ? DEFAULT_LABELS[key]
      : rawKey && !KEYS.has(rawKey)
        ? humanize(rawKey)
        : "";
  const label = rawLabel ? humanize(rawLabel) : fallback;
  return label ? { key, label } : null;
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
