import type { DocumentKind } from "@law/api-interfaces";

/** Kinds that have a fact extraction pass; every other document is OTHER. */
export const FACT_KINDS = [
  "ID_CARD",
  "PASSPORT",
  "APR_EXCERPT",
  "COURT_DECISION",
  "ADMIN_DECISION",
] as const;

export type FactKind = (typeof FACT_KINDS)[number];

/** Every kind the classifier may answer with. */
export const DOCUMENT_KINDS: readonly DocumentKind[] = [...FACT_KINDS, "OTHER"];

export const SUBJECT_TYPES = ["PERSON", "COMPANY", "DECISION"] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];

const PERSON_DOCUMENT_FIELDS = [
  "fullName",
  "firstName",
  "lastName",
  "jmbg",
  "dateOfBirth",
  "placeOfBirth",
  "address",
  "documentNumber",
  "issuedDate",
  "expiryDate",
  "issuingAuthority",
  "nationality",
] as const;

const DECISION_FIELDS = [
  "authority",
  "caseNumber",
  "decisionDate",
  "outcome",
  "servedDate",
  "legalRemedyInstruction",
  // A party is a repeated PERSON/COMPANY subject (name plus its role).
  "fullName",
] as const;

/**
 * Fields the model may report per kind. `representatives` (APR) and `parties`
 * (decisions) are not fields: each one is its own subject, whose name is
 * `fullName`, whose identifier is `jmbg` and whose role is `subjectRole`.
 */
export const FACT_FIELDS: Record<FactKind, readonly string[]> = {
  ID_CARD: PERSON_DOCUMENT_FIELDS,
  PASSPORT: PERSON_DOCUMENT_FIELDS,
  APR_EXCERPT: [
    "companyName",
    "registrationNumber",
    "taxNumber",
    "seatAddress",
    "legalForm",
    "fullName",
    "jmbg",
  ],
  COURT_DECISION: DECISION_FIELDS,
  ADMIN_DECISION: DECISION_FIELDS,
};

/** Fields whose value is a date and is normalized to YYYY-MM-DD. */
export const DATE_FIELDS: ReadonlySet<string> = new Set([
  "dateOfBirth",
  "issuedDate",
  "expiryDate",
  "decisionDate",
  "servedDate",
]);

export function isFactKind(kind: string): kind is FactKind {
  return (FACT_KINDS as readonly string[]).includes(kind);
}
