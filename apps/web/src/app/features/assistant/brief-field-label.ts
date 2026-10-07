import { BRIEF_MISSING_FIELD_KEYS, BriefMissingField } from "@law/api-interfaces";

const TRANSLATED_KEYS = new Set<string>(
  BRIEF_MISSING_FIELD_KEYS.filter((key) => key !== "other"),
);

// Known keys use the translated label; "other" and keys specific to a document
// type (e.g. "contestedDecision") keep the model's Serbian label.
export function briefFieldLabel(
  field: BriefMissingField,
  translate: (key: string) => string,
): string {
  return TRANSLATED_KEYS.has(field.key)
    ? translate(`assistant.briefField.${field.key}`)
    : field.label;
}
