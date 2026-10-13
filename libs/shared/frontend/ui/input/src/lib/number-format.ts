export type HlmNumberLocale = "sr" | "en";

/** No conversion through Number: decimal-string money may exceed safe integer precision. */
export function formatInputNumber(
  value: string,
  locale: HlmNumberLocale,
  minimumFractionDigits: number,
  grouped = true,
): string {
  const match = /^(-?)(\d+)(?:\.(\d*))?$/.exec(value);
  if (!match) return value;
  const [, sign, whole, fraction = ""] = match;
  const group = locale === "sr" ? "." : ",";
  const decimal = locale === "sr" ? "," : ".";
  const integer = whole.replace(/^0+(?=\d)/, "");
  const digits = grouped
    ? integer.replace(/\B(?=(\d{3})+(?!\d))/g, group)
    : integer;
  const decimals = fraction.padEnd(minimumFractionDigits, "0");
  return sign + digits + (decimals.length ? decimal + decimals : "");
}

/** null means malformed; an empty string means an intentionally empty field. */
export function parseInputNumber(
  value: string,
  locale: HlmNumberLocale,
): string | null {
  const raw = value.trim();
  if (!raw) return "";
  const match = /^([+-]?)([\d.,\s]+)$/.exec(raw);
  if (!match) return null;
  const sign = match[1] === "-" ? "-" : "";
  let body = match[2];
  // Spaces are accepted only as valid three-digit grouping, never by concatenating arbitrary tokens.
  if (/\s/.test(body)) {
    if (!/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?$/.test(body))
      return null;
    body = body.replace(/\s/g, "");
  }
  const decimal = locale === "sr" ? "," : ".";
  const group = locale === "sr" ? "." : ",";
  let decimalMark: string | undefined;
  let groupMark: string | undefined;
  if (body.includes(".") && body.includes(",")) {
    decimalMark = body.lastIndexOf(".") > body.lastIndexOf(",") ? "." : ",";
    groupMark = decimalMark === "." ? "," : ".";
  } else if (body.includes(decimal)) {
    // Multiple well-formed groups cannot be a decimal, even in the other locale.
    const escapedDecimal = decimal === "." ? "\\." : ",";
    if (
      new RegExp("^[1-9]\\d{0,2}(?:" + escapedDecimal + "\\d{3}){2,}$").test(
        body,
      )
    )
      groupMark = decimal;
    else decimalMark = decimal;
  } else if (body.includes(group)) {
    const escapedGroup = group === "." ? "\\." : ",";
    if (new RegExp("^[1-9]\\d{0,2}(?:" + escapedGroup + "\\d{3})+$").test(body))
      groupMark = group;
    else decimalMark = group;
  }
  const parts = decimalMark ? body.split(decimalMark) : [body];
  if (parts.length > 2) return null;
  let whole = parts[0];
  const fraction = parts[1];
  if (groupMark) {
    const escapedGroup = groupMark === "." ? "\\." : ",";
    if (!new RegExp("^\\d{1,3}(?:" + escapedGroup + "\\d{3})+$").test(whole))
      return null;
    whole = whole.split(groupMark).join("");
  }
  if (
    !/^\d*$/.test(whole) ||
    (fraction !== undefined && !/^\d*$/.test(fraction)) ||
    !(whole + (fraction ?? "")).length
  )
    return null;
  whole = (whole || "0").replace(/^0+(?=\d)/, "");
  return sign + whole + (fraction ? "." + fraction : "");
}
