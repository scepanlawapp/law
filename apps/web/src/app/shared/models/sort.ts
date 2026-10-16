import { PaginationSort, SortDirection } from "@law/api-interfaces";
import { SelectOption } from "./select-option";

/** How a sortable field reads: drives the direction wording ("newest", "A–Z", …). */
export const SortKind = {
  DATE: "DATE",
  TEXT: "TEXT",
  NUMBER: "NUMBER",
} as const;
export type SortKind = (typeof SortKind)[keyof typeof SortKind];

export interface SortField {
  /** Translation key of the field name. */
  readonly label: string;
  readonly kind: SortKind;
}

/** Sortable fields of one list, keyed by the API field name, in display order. */
export type SortFields<TField extends string> = Readonly<
  Record<TField, SortField>
>;

/** Wire format used by list queries: `field:direction`. */
export type SortValue<TField extends string> = `${TField}:${SortDirection}`;

const SORT_DIRECTION_LABELS: Readonly<
  Record<SortKind, Readonly<Record<SortDirection, string>>>
> = {
  [SortKind.DATE]: {
    [SortDirection.DESC]: "sort.date.desc",
    [SortDirection.ASC]: "sort.date.asc",
  },
  [SortKind.TEXT]: {
    [SortDirection.ASC]: "sort.text.asc",
    [SortDirection.DESC]: "sort.text.desc",
  },
  [SortKind.NUMBER]: {
    [SortDirection.ASC]: "sort.number.asc",
    [SortDirection.DESC]: "sort.number.desc",
  },
};

/** Dates list newest first; text and numbers ascending first. */
const DIRECTION_ORDER: Readonly<Record<SortKind, readonly SortDirection[]>> = {
  [SortKind.DATE]: [SortDirection.DESC, SortDirection.ASC],
  [SortKind.TEXT]: [SortDirection.ASC, SortDirection.DESC],
  [SortKind.NUMBER]: [SortDirection.ASC, SortDirection.DESC],
};

export function sortValue<TField extends string>(
  field: TField,
  direction: SortDirection,
): SortValue<TField> {
  return `${field}:${direction}`;
}

/** Every field in both directions; `label` holds the field's translation key. */
export function sortOptions<TField extends string>(
  fields: SortFields<TField>,
): SelectOption<SortValue<TField>>[] {
  return (Object.keys(fields) as TField[]).flatMap((field) =>
    DIRECTION_ORDER[fields[field].kind].map((direction) => ({
      value: sortValue(field, direction),
      label: fields[field].label,
    })),
  );
}

export function parseSort<TField extends string>(
  fields: SortFields<TField>,
  value: string | null | undefined,
): PaginationSort | null {
  const [field, direction] = (value ?? "").split(":");
  if (!(field in fields)) return null;
  if (direction !== SortDirection.ASC && direction !== SortDirection.DESC)
    return null;
  return { field, direction };
}

export function isSortValue<TField extends string>(
  fields: SortFields<TField>,
  value: string | null | undefined,
): value is SortValue<TField> {
  return parseSort(fields, value) !== null;
}

/** "Field · direction" for select triggers and items. */
export function createSortItemToString<TField extends string>(
  fields: SortFields<TField>,
  translate: (key: string, params?: Record<string, string>) => string,
): (value: string | null | undefined) => string {
  return (value) => {
    const sort = parseSort(fields, value);
    if (!sort) return "";
    const field = fields[sort.field as TField];
    return translate("sort.option", {
      field: translate(field.label),
      direction: translate(SORT_DIRECTION_LABELS[field.kind][sort.direction]),
    });
  };
}
