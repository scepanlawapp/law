import { BriefMissingField } from "@law/api-interfaces";

// Known keys use the translated label; "other" keeps the model's Serbian label.
export function briefFieldLabel(
  field: BriefMissingField,
  translate: (key: string) => string,
): string {
  return field.key === "other"
    ? field.label
    : translate(`assistant.briefField.${field.key}`);
}
