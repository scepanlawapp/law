import {
  BriefFieldValue,
  BriefMissingField,
  BriefPartyEntry,
  isDraftDocumentType,
} from "@law/api-interfaces";
import {
  DEFAULT_DOCUMENT_TYPE,
  type DocumentTypeDefinition,
  describeMissingField,
  getDocumentType,
  missingFieldKeys,
} from "./document-types";
import { normalizeEvidence, normalizeMissingFields } from "./normalize";
import type { BriefResult } from "./schema";

/**
 * Aligns a brief with its document type: one entry per party role and field
 * (in registry order), and missing-field keys the type knows ("other" for the
 * rest, keeping the model's label).
 */
export function normalizeBriefForType(
  brief: BriefResult,
  type: DocumentTypeDefinition = getDocumentType(brief.documentType),
): BriefResult {
  const parties: BriefPartyEntry[] = type.parties.map((party) => {
    const found = brief.parties.find((item) => item.role === party.role);
    return {
      role: party.role,
      name: clean(found?.name),
      address: clean(found?.address),
      idNumber: clean(found?.idNumber),
    };
  });
  const fields: BriefFieldValue[] = type.fields.map((field) => ({
    key: field.key,
    value: clean(brief.fields.find((item) => item.key === field.key)?.value),
  }));
  const allowed = new Set(missingFieldKeys(type));
  const missingFields: BriefMissingField[] = [];
  for (const item of brief.missingFields) {
    const known = allowed.has(item.key);
    const label =
      item.label.trim() ||
      (known ? (describeMissingField(type, item.key)?.label ?? "") : "");
    if (!label) continue;
    missingFields.push({ key: known ? item.key : "other", label });
  }
  return {
    ...brief,
    documentType: type.id,
    parties,
    fields,
    missingFields,
  };
}

/**
 * Reads a stored brief. Rows written before document types (v1: fixed
 * plaintiff/defendant/court fields) become LAWSUIT briefs.
 */
export function normalizeBrief(value: unknown): BriefResult {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const documentType = isDraftDocumentType(record["documentType"])
    ? record["documentType"]
    : DEFAULT_DOCUMENT_TYPE;
  const v1 = !Array.isArray(record["parties"]);
  const type = getDocumentType(documentType);
  const base: BriefResult = {
    documentType,
    parties: v1 ? v1Parties(record) : readParties(record["parties"]),
    fields: v1 ? v1Fields(record) : readFields(record["fields"]),
    legalBasis: Array.isArray(record["legalBasis"])
      ? record["legalBasis"].filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    factualDescription: clean(record["factualDescription"]),
    evidence: normalizeEvidence(record["evidence"]),
    missingFields: normalizeMissingFields(
      record["missingFields"],
      new Set(missingFieldKeys(type)),
    ),
    confidence:
      typeof record["confidence"] === "number" ? record["confidence"] : 0,
    warnings: Array.isArray(record["warnings"])
      ? record["warnings"].filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  };
  return normalizeBriefForType(base, type);
}

/** The brief's party with this role, if any. */
export function briefParty(
  brief: BriefResult,
  role: string,
): BriefPartyEntry | null {
  return brief.parties.find((party) => party.role === role) ?? null;
}

export function briefFieldValue(brief: BriefResult, key: string): string | null {
  return brief.fields.find((field) => field.key === key)?.value ?? null;
}

function v1Parties(record: Record<string, unknown>): BriefPartyEntry[] {
  return (["plaintiff", "defendant"] as const).map((role) => {
    const party =
      record[role] && typeof record[role] === "object"
        ? (record[role] as Record<string, unknown>)
        : {};
    return {
      role,
      name: clean(party["name"]),
      address: clean(party["address"]),
      idNumber: null,
    };
  });
}

function v1Fields(record: Record<string, unknown>): BriefFieldValue[] {
  return ["competentCourt", "claimValue", "reliefSought"].map((key) => ({
    key,
    value: clean(record[key]),
  }));
}

function readParties(value: unknown): BriefPartyEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .filter((item) => typeof item["role"] === "string")
    .map((item) => ({
      role: item["role"] as string,
      name: clean(item["name"]),
      address: clean(item["address"]),
      idNumber: clean(item["idNumber"]),
    }));
}

function readFields(value: unknown): BriefFieldValue[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object",
    )
    .filter((item) => typeof item["key"] === "string")
    .map((item) => ({ key: item["key"] as string, value: clean(item["value"]) }));
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
