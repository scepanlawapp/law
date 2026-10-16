/** Enum-like object (`X.VALUE === "VALUE"`) for a readonly tuple of string literals. */
export function enumOf<const T extends readonly string[]>(
  values: T,
): { readonly [K in T[number]]: K } {
  return Object.freeze(
    Object.fromEntries(values.map((value) => [value, value])),
  ) as { readonly [K in T[number]]: K };
}
