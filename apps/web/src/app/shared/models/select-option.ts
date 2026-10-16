/** A select/combobox option; `label` is a translation key. */
export interface SelectOption<TValue extends string = string> {
  readonly value: TValue;
  readonly label: string;
}

/** Translation key for every value of an enum, in display order. */
export type LabelMap<TValue extends string> = Readonly<Record<TValue, string>>;

/** Value used by "all" filter options. */
export const ALL_OPTION_VALUE = "";
export type AllOptionValue = typeof ALL_OPTION_VALUE;

export function optionsFrom<TValue extends string>(
  labels: LabelMap<TValue>,
  values: readonly TValue[] = Object.keys(labels) as TValue[],
): SelectOption<TValue>[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

/** Filter options with a leading "all" entry. */
export function filterOptionsFrom<TValue extends string>(
  labels: LabelMap<TValue>,
  allLabel: string,
  values?: readonly TValue[],
): SelectOption<TValue | AllOptionValue>[] {
  return [
    { value: ALL_OPTION_VALUE, label: allLabel },
    ...optionsFrom(labels, values),
  ];
}

export function getSelectOptionLabel<TValue extends string = string>(
  value: TValue | string | null | undefined,
  options: ReadonlyArray<SelectOption<TValue>>,
  translate: (key: string) => string,
): string {
  const option = options.find((item) => item.value === value);
  const labelKey = option?.label ?? (typeof value === "string" ? value : "");

  return labelKey ? translate(labelKey) : "";
}

export function createSelectItemToString<TValue extends string = string>(
  options: ReadonlyArray<SelectOption<TValue>>,
  translate: (key: string) => string,
): (value: TValue | string | null | undefined) => string {
  return (value: TValue | string | null | undefined) =>
    getSelectOptionLabel(value, options, translate);
}

/** Translates an enum value through its label map; unknown values pass through. */
export function labelOf<TValue extends string>(
  labels: LabelMap<TValue>,
  value: TValue | string | null | undefined,
  translate: (key: string) => string,
): string {
  if (!value) return "";
  const key = (labels as Record<string, string>)[value];
  return key ? translate(key) : value;
}
