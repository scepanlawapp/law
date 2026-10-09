import { digitsOnly, foldForMatch } from "@law/document-intelligence";
import type { AssistantDocumentFactConflict } from "@law/mastra";

/** One extracted fact tied to the readable source it came from. */
export interface SourcedFact {
  ref: string;
  contentId: string;
  subjectKey: string;
  subjectType: string;
  field: string;
  value: string;
  normalizedValue: string | null;
}

const NAME_FIELDS: Record<string, string> = {
  PERSON: "fullName",
  COMPANY: "companyName",
};
/** JMBG for people, matični broj for companies. */
const IDENTIFIER_FIELDS: Record<string, string> = {
  PERSON: "jmbg",
  COMPANY: "registrationNumber",
};

/**
 * Fields that identify who or what a subject is and so must agree across
 * documents. Document-specific fields (document number, issue and expiry dates,
 * issuing authority) and addresses (people move) are deliberately absent.
 */
export const CONFLICT_FIELDS: ReadonlySet<string> = new Set([
  "fullName",
  "firstName",
  "lastName",
  "jmbg",
  "dateOfBirth",
  "placeOfBirth",
  "nationality",
  "companyName",
  "registrationNumber",
  "taxNumber",
  "legalForm",
  "seatAddress",
]);

type Entity = {
  type: string;
  contentId: string;
  facts: SourcedFact[];
  keys: string[];
  label: string;
};

function comparable(fact: SourcedFact): string {
  return foldForMatch(fact.normalizedValue ?? fact.value);
}

/** True when two facts from different documents carry different values. */
function differsAcrossDocuments(facts: SourcedFact[]): boolean {
  return facts.some((first) =>
    facts.some(
      (second) =>
        first.contentId !== second.contentId &&
        comparable(first) !== comparable(second),
    ),
  );
}

/**
 * Facts that two documents report differently for the same person or company.
 * Subjects are the same entity when they share a subject type and either a
 * folded name or an identifier (JMBG / matični broj). Decisions have no
 * identity and are never compared. Only `CONFLICT_FIELDS` are compared: within
 * one entity a field conflicts when
 * different documents carry different `normalizedValue ?? value`.
 */
export function findFactConflicts(
  facts: SourcedFact[],
): AssistantDocumentFactConflict[] {
  const bySubject = new Map<string, SourcedFact[]>();
  for (const fact of facts) {
    if (!NAME_FIELDS[fact.subjectType]) continue;
    const key = `${fact.contentId}\u0000${fact.subjectKey}`;
    const list = bySubject.get(key) ?? [];
    list.push(fact);
    bySubject.set(key, list);
  }

  const entities: Entity[] = [];
  for (const subjectFacts of bySubject.values()) {
    const { subjectType, contentId } = subjectFacts[0];
    const name = subjectFacts.find(
      (fact) => fact.field === NAME_FIELDS[subjectType],
    );
    const identifier = subjectFacts.find(
      (fact) => fact.field === IDENTIFIER_FIELDS[subjectType],
    );
    const keys: string[] = [];
    const folded = name ? foldForMatch(name.normalizedValue ?? name.value) : "";
    if (folded) keys.push(`${subjectType}|name|${folded}`);
    const digits = identifier
      ? digitsOnly(identifier.normalizedValue ?? identifier.value)
      : "";
    if (digits) keys.push(`${subjectType}|id|${digits}`);
    if (!keys.length) continue;
    entities.push({
      type: subjectType,
      contentId,
      facts: subjectFacts,
      keys,
      label: name?.value ?? identifier?.value ?? subjectFacts[0].subjectKey,
    });
  }

  // Union entities that share any key.
  const parent = entities.map((_, index) => index);
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const owner = new Map<string, number>();
  entities.forEach((entity, index) => {
    for (const key of entity.keys) {
      const known = owner.get(key);
      if (known === undefined) owner.set(key, index);
      else parent[find(index)] = find(known);
    }
  });
  const groups = new Map<number, Entity[]>();
  entities.forEach((entity, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), entity]);
  });

  const conflicts: AssistantDocumentFactConflict[] = [];
  for (const group of groups.values()) {
    if (new Set(group.map((entity) => entity.contentId)).size < 2) continue;
    const fields = new Map<string, SourcedFact[]>();
    for (const fact of group.flatMap((entity) => entity.facts)) {
      if (!CONFLICT_FIELDS.has(fact.field)) continue;
      fields.set(fact.field, [...(fields.get(fact.field) ?? []), fact]);
    }
    for (const [field, fieldFacts] of fields) {
      if (!differsAcrossDocuments(fieldFacts)) continue;
      const seen = new Set<string>();
      const values: Array<{ value: string; ref: string }> = [];
      for (const fact of fieldFacts) {
        const id = `${fact.ref}\u0000${comparable(fact)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        values.push({ value: fact.value, ref: fact.ref });
      }
      conflicts.push({ field, subject: group[0].label, values });
    }
  }
  return conflicts;
}
