/**
 * Generators for fictional, checksum-valid identifiers used by specs.
 * Not exported from the package index.
 */

/** JMBG from `DDMMYYY` using region 71 and serial 000. */
export function buildJmbgForTest(
  ddmmyyy: string,
  region = "71",
  serial = "000",
): string {
  const first12 = `${ddmmyyy}${region}${serial}`;
  const a = first12.split("").map(Number);
  const sum =
    7 * (a[0] + a[6]) +
    6 * (a[1] + a[7]) +
    5 * (a[2] + a[8]) +
    4 * (a[3] + a[9]) +
    3 * (a[4] + a[10]) +
    2 * (a[5] + a[11]);
  const m = 11 - (sum % 11);
  return `${first12}${m > 9 ? 0 : m}`;
}

/** PIB from 8 digits using ISO 7064 MOD 11,10. */
export function buildPibForTest(first8: string): string {
  let p = 10;
  for (const ch of first8) {
    let s = (Number(ch) + p) % 10;
    if (s === 0) s = 10;
    p = (s * 2) % 11;
  }
  return `${first8}${(11 - p) % 10}`;
}
