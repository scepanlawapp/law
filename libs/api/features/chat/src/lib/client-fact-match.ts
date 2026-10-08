import { digitsOnly, foldForMatch } from "@law/document-intelligence";

/** Client fields a document fact may fill (only while the field is empty). */
export type ClientFillField =
  | "jmbg"
  | "firstName"
  | "lastName"
  | "registrationNumber"
  | "taxNumber"
  | "address"
  | "identificationDocument";

/** The parts of a client the match needs; no more than that is read. */
export interface ClientFieldSnapshot {
  type: "INDIVIDUAL" | "ORGANIZATION";
  firstName: string | null;
  lastName: string | null;
  jmbg: string | null;
  registrationNumber: string | null;
  taxNumber: string | null;
  /** Number of `ClientAddress` rows. */
  addressCount: number;
  /** Numbers of the client's `ClientIdentificationDocument` rows. */
  identificationNumbers: string[];
}

export interface ClientFactInput {
  field: string;
  value: string;
  /** Digits for identifiers, YYYY-MM-DD for dates; null otherwise. */
  normalizedValue: string | null;
  quote: string;
}

export interface ClientFactSubject {
  subjectType: string;
  /** ID_CARD / PASSPORT decide the type of a new identification document. */
  documentKind?: string;
  facts: ClientFactInput[];
}

/** `ClientAddress` columns that must be filled (all required by the clients UI). */
export interface ClientAddressFill {
  addressType: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface ClientIdentificationDocumentFill {
  type: string;
  number: string;
  issuedDate: string | null;
  expiredDate: string | null;
  country: string;
}

export interface ClientFillItem {
  field: ClientFillField;
  value: string;
  quote: string;
  /** Only for `address`. */
  address?: ClientAddressFill;
  /** Only for `identificationDocument`. */
  identificationDocument?: ClientIdentificationDocumentFill;
}

export interface ClientFieldConflict {
  field: ClientFillField;
  current: string;
  found: string;
}

export interface ClientFieldMatch {
  matched: boolean;
  fill: ClientFillItem[];
  conflicts: ClientFieldConflict[];
}

/** Stored codes of `ClientIdentificationDocument.type` (see the demo seeds). */
const IDENTIFICATION_TYPES: Record<string, string> = {
  ID_CARD: "LICNA_KARTA",
  PASSPORT: "PASSPORT",
};
const DEFAULT_COUNTRY = "RS";
const ADDRESS_TYPE = "REGISTERED";
const POSTAL_CODE = /(?<!\d)\d{5}(?!\d)/;

/** Folded nationality prefixes that clearly name a country (ISO 3166-1 alpha-2). */
const NATIONALITY_COUNTRIES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(srb|srp|serb|rs$|republikasrbija|republicofserbia)/, "RS"],
  [/^(hrvat|croat|hr$)/, "HR"],
  [/^(bosan|bih|bosnia|ba$)/, "BA"],
  [/^(crnogor|montenegr|me$)/, "ME"],
  [/^(makedon|macedon|northmacedonia|mk$)/, "MK"],
  [/^(sloven|slovenia|si$)/, "SI"],
  [/^(madjar|mad.ar|hungar|hu$)/, "HU"],
  [/^(rumun|romania|ro$)/, "RO"],
  [/^(bugar|bulgar|bg$)/, "BG"],
  [/^(nemac|nemack|german|de$)/, "DE"],
  [/^(austrij|austria|at$)/, "AT"],
  [/^(ital|it$)/, "IT"],
  [/^(rusk|rus$|russia|ru$)/, "RU"],
  [/^(americ|usa|unitedstates|us$)/, "US"],
];

const ALL_FIELDS: readonly ClientFillField[] = [
  "jmbg",
  "firstName",
  "lastName",
  "registrationNumber",
  "taxNumber",
  "address",
  "identificationDocument",
];

function blank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

function bestFact(
  facts: ClientFactInput[],
  field: string,
): ClientFactInput | undefined {
  return facts.find((fact) => fact.field === field && fact.value.trim());
}

function identifier(fact: ClientFactInput | undefined): string {
  return fact ? digitsOnly(fact.normalizedValue ?? fact.value) : "";
}

/** Fields that are empty on the client and so could receive a document fact. */
export function clientEmptyFillFields(
  client: ClientFieldSnapshot,
): ClientFillField[] {
  const empty: ClientFillField[] = [];
  const person = client.type === "INDIVIDUAL";
  if (person) {
    if (blank(client.jmbg)) empty.push("jmbg");
    if (blank(client.firstName)) empty.push("firstName");
    if (blank(client.lastName)) empty.push("lastName");
  } else {
    if (blank(client.registrationNumber)) empty.push("registrationNumber");
    if (blank(client.taxNumber)) empty.push("taxNumber");
  }
  if (client.addressCount === 0) empty.push("address");
  if (person && client.identificationNumbers.length === 0) {
    empty.push("identificationDocument");
  }
  return ALL_FIELDS.filter((field) => empty.includes(field));
}

/** Upper-case names print as "PETROVIĆ"; clients store "Petrović". */
function nameCase(value: string): string {
  const trimmed = value.trim();
  if (trimmed !== trimmed.toUpperCase() || trimmed === trimmed.toLowerCase()) {
    return trimmed;
  }
  return trimmed
    .toLowerCase()
    .replace(
      /(^|[\s-])(\p{L})/gu,
      (_, boundary: string, letter: string) =>
        `${boundary}${letter.toUpperCase()}`,
    );
}

/** Street, city, and postal code of a one-line address; null when any is missing. */
export function parseAddress(value: string): ClientAddressFill | null {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const index = parts.findIndex((part) => POSTAL_CODE.test(part));
  if (index === -1) return null;
  const postalCode = parts[index].match(POSTAL_CODE)?.[0] ?? "";
  const rest = parts[index].replace(POSTAL_CODE, "").trim();
  const others = parts.filter((_, position) => position !== index);
  let city = rest;
  let streetParts = others;
  if (!city) {
    // "Kneza Miloša 10, 11000, Beograd": the city is the part after the code.
    const following = parts[index + 1];
    if (!following) return null;
    city = following;
    streetParts = others.filter((part) => part !== following);
  }
  const street = streetParts.join(", ").trim();
  if (!street || !city) return null;
  return {
    addressType: ADDRESS_TYPE,
    street,
    city,
    postalCode,
    country: DEFAULT_COUNTRY,
  };
}

function countryOf(nationality: string | undefined): string {
  const folded = nationality
    ? foldForMatch(nationality).replace(/\s+/g, "")
    : "";
  if (!folded) return DEFAULT_COUNTRY;
  return (
    NATIONALITY_COUNTRIES.find(([pattern]) => pattern.test(folded))?.[1] ??
    DEFAULT_COUNTRY
  );
}

function isoDate(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function sameNumber(a: string, b: string): boolean {
  const fold = (value: string) => foldForMatch(value).replace(/[^a-z0-9]/g, "");
  return fold(a) !== "" && fold(a) === fold(b);
}

function addressItem(
  subject: ClientFactSubject,
  field: "address" | "seatAddress",
): ClientFillItem | null {
  const fact = bestFact(subject.facts, field);
  const address = fact ? parseAddress(fact.value) : null;
  return fact && address
    ? { field: "address", value: fact.value.trim(), quote: fact.quote, address }
    : null;
}

function personNames(facts: ClientFactInput[]): string[] {
  const full = bestFact(facts, "fullName");
  const first = bestFact(facts, "firstName");
  const last = bestFact(facts, "lastName");
  const names: string[] = [];
  if (full) names.push(full.value);
  if (first && last) {
    names.push(`${first.value} ${last.value}`, `${last.value} ${first.value}`);
  }
  return names.map(foldForMatch).filter(Boolean);
}

function matchPerson(
  client: ClientFieldSnapshot,
  subject: ClientFactSubject,
): ClientFieldMatch {
  const { facts } = subject;
  const conflicts: ClientFieldConflict[] = [];
  const clientNames =
    blank(client.firstName) || blank(client.lastName)
      ? []
      : [
          foldForMatch(`${client.firstName} ${client.lastName}`),
          foldForMatch(`${client.lastName} ${client.firstName}`),
        ];
  const nameMatch = personNames(facts).some((name) =>
    clientNames.includes(name),
  );
  const jmbgFact = bestFact(facts, "jmbg");
  const foundJmbg = identifier(jmbgFact);
  const clientJmbg = digitsOnly(client.jmbg ?? "");
  const jmbgMatch = !!foundJmbg && !!clientJmbg && foundJmbg === clientJmbg;
  if (foundJmbg && clientJmbg && foundJmbg !== clientJmbg) {
    // A name that matches while the JMBG does not is probably another person.
    conflicts.push({
      field: "jmbg",
      current: client.jmbg?.trim() ?? clientJmbg,
      found: foundJmbg,
    });
    return { matched: false, fill: [], conflicts };
  }
  if (!nameMatch && !jmbgMatch) return { matched: false, fill: [], conflicts };

  const fill: ClientFillItem[] = [];
  if (jmbgFact && foundJmbg && blank(client.jmbg)) {
    fill.push({ field: "jmbg", value: foundJmbg, quote: jmbgFact.quote });
  }
  for (const field of ["firstName", "lastName"] as const) {
    const fact = bestFact(facts, field);
    if (!fact) continue;
    const current = client[field];
    if (blank(current)) {
      fill.push({ field, value: nameCase(fact.value), quote: fact.quote });
    } else if (foldForMatch(current ?? "") !== foldForMatch(fact.value)) {
      conflicts.push({
        field,
        current: current?.trim() ?? "",
        found: fact.value.trim(),
      });
    }
  }
  if (client.addressCount === 0) {
    const item = addressItem(subject, "address");
    if (item) fill.push(item);
  }
  const numberFact = bestFact(facts, "documentNumber");
  const type = IDENTIFICATION_TYPES[subject.documentKind ?? ""];
  if (
    numberFact &&
    type &&
    !client.identificationNumbers.some((number) =>
      sameNumber(number, numberFact.value),
    )
  ) {
    fill.push({
      field: "identificationDocument",
      value: numberFact.value.trim(),
      quote: numberFact.quote,
      identificationDocument: {
        type,
        number: numberFact.value.trim(),
        issuedDate: isoDate(
          bestFact(facts, "issuedDate")?.normalizedValue ?? null,
        ),
        expiredDate: isoDate(
          bestFact(facts, "expiryDate")?.normalizedValue ?? null,
        ),
        country: countryOf(bestFact(facts, "nationality")?.value),
      },
    });
  }
  return { matched: true, fill: sortFill(fill), conflicts };
}

function matchCompany(
  client: ClientFieldSnapshot,
  subject: ClientFactSubject,
): ClientFieldMatch {
  const { facts } = subject;
  const conflicts: ClientFieldConflict[] = [];
  const fill: ClientFillItem[] = [];
  let matched = false;
  for (const field of ["registrationNumber", "taxNumber"] as const) {
    const fact = bestFact(facts, field);
    const found = identifier(fact);
    const current = digitsOnly(client[field] ?? "");
    if (!fact || !found) continue;
    if (!current) {
      fill.push({ field, value: found, quote: fact.quote });
    } else if (current === found) {
      matched = true;
    } else {
      conflicts.push({
        field,
        current: client[field]?.trim() ?? current,
        found,
      });
    }
  }
  // The name of a company is never a match: only MB or PIB identify it.
  if (!matched || conflicts.length) {
    return { matched: false, fill: [], conflicts };
  }
  if (client.addressCount === 0) {
    const item = addressItem(subject, "seatAddress");
    if (item) fill.push(item);
  }
  return { matched: true, fill: sortFill(fill), conflicts };
}

function sortFill(fill: ClientFillItem[]): ClientFillItem[] {
  return [...fill].sort(
    (a, b) => ALL_FIELDS.indexOf(a.field) - ALL_FIELDS.indexOf(b.field),
  );
}

/**
 * Whether a document subject is this client, and which empty client fields its
 * facts could fill. A person matches by folded first and last name (either
 * order) or by JMBG; a company only by MB or PIB. A different value in a field
 * that identifies the subject (JMBG, MB, PIB) means another entity: no match,
 * no proposal, only the conflict. Other differing values are warnings and are
 * never overwritten.
 */
export function matchClientFields(
  client: ClientFieldSnapshot,
  subject: ClientFactSubject,
): ClientFieldMatch {
  if (subject.subjectType === "PERSON" && client.type === "INDIVIDUAL") {
    return matchPerson(client, subject);
  }
  if (subject.subjectType === "COMPANY" && client.type === "ORGANIZATION") {
    return matchCompany(client, subject);
  }
  return { matched: false, fill: [], conflicts: [] };
}
