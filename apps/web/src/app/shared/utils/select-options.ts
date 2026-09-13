export type SelectOption<TValue extends string = string> = {
  value: TValue;
  label: string;
};

export function getSelectOptionLabel<TValue extends string = string>(
  value: TValue | string | null | undefined,
  options: ReadonlyArray<SelectOption<TValue>>,
  translate: (key: string) => string,
): string {
  const option = options.find((item) => item.value === value);
  const labelKey = option?.label ?? (typeof value === "string" ? value : "");

  return labelKey ? translate(labelKey) : "";
}
