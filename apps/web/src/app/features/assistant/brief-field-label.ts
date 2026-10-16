import { BriefMissingField } from "@law/api-interfaces";
import { BRIEF_MISSING_FIELD_LABELS } from "../../shared/models";

// Known keys use the translated label; "other" and keys specific to a document
// type (e.g. "contestedDecision") keep the model's Serbian label.
export function briefFieldLabel(
  field: BriefMissingField,
  translate: (key: string) => string,
): string {
  const labels: Readonly<Record<string, string>> = BRIEF_MISSING_FIELD_LABELS;
  return Object.prototype.hasOwnProperty.call(labels, field.key)
    ? translate(labels[field.key])
    : field.label;
}
