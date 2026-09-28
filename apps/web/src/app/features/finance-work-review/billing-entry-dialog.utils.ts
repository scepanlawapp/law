export function toDateInputValue(
  value?: string,
  fallbackDate = new Date(),
): string {
  if (value) return value.slice(0, 10);

  const year = fallbackDate.getFullYear();
  const month = String(fallbackDate.getMonth() + 1).padStart(2, "0");
  const day = String(fallbackDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
