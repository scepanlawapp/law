/** Removes every non-digit character. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function jmbgParts(
  value: string,
): { year: number; month: number; day: number } | null {
  if (!/^\d{13}$/.test(value)) {
    return null;
  }
  const day = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const yyy = Number(value.slice(4, 7));
  const year = yyy < 800 ? 2000 + yyy : 1000 + yyy;
  return isCalendarDate(year, month, day) ? { year, month, day } : null;
}

/** Validates a 13-digit JMBG: real birth date and mod-11 control digit. */
export function isValidJmbg(value: string): boolean {
  if (jmbgParts(value) === null) {
    return false;
  }
  const a = value.split("").map(Number);
  const sum =
    7 * (a[0] + a[6]) +
    6 * (a[1] + a[7]) +
    5 * (a[2] + a[8]) +
    4 * (a[3] + a[9]) +
    3 * (a[4] + a[10]) +
    2 * (a[5] + a[11]);
  const m = 11 - (sum % 11);
  return (m > 9 ? 0 : m) === a[12];
}

/** Returns the ISO birth date (YYYY-MM-DD) encoded in a valid JMBG, else null. */
export function jmbgBirthDate(value: string): string | null {
  if (!isValidJmbg(value)) {
    return null;
  }
  const parts = jmbgParts(value);
  if (!parts) {
    return null;
  }
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}

/** Validates a 9-digit PIB: ISO 7064 MOD 11,10 check digit over the first 8. */
export function isValidPib(value: string): boolean {
  if (!/^\d{9}$/.test(value)) {
    return false;
  }
  let p = 10;
  for (let i = 0; i < 8; i++) {
    let s = (Number(value[i]) + p) % 10;
    if (s === 0) {
      s = 10;
    }
    p = (s * 2) % 11;
  }
  return (11 - p) % 10 === Number(value[8]);
}

/** Validates a matični broj (MB): exactly 8 digits. */
export function isValidMb(value: string): boolean {
  return /^\d{8}$/.test(value);
}
