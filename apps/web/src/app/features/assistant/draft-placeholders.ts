export interface DraftPlaceholderOccurrence {
  start: number;
  end: number;
}

export interface DraftPlaceholder {
  // Normalized label, used as the grouping key.
  id: string;
  label: string;
  occurrences: DraftPlaceholderOccurrence[];
}

// Placeholders stay Latin in Cyrillic view (protected from transliteration).
const PLACEHOLDER = /\[UNOS POTREBAN:\s*([^\]]*?)\s*\]/g;

export function findPlaceholders(text: string): DraftPlaceholder[] {
  const groups = new Map<string, DraftPlaceholder>();
  for (const match of text.matchAll(PLACEHOLDER)) {
    const label = match[1].replace(/\s+/g, " ").trim();
    const id = label.toLocaleLowerCase("sr-Latn");
    const start = match.index ?? 0;
    const occurrence = { start, end: start + match[0].length };
    const group = groups.get(id);
    if (group) group.occurrences.push(occurrence);
    else
      groups.set(id, {
        id,
        label: label.charAt(0).toLocaleUpperCase("sr-Latn") + label.slice(1),
        occurrences: [occurrence],
      });
  }
  return [...groups.values()];
}

export function countPlaceholders(text: string): number {
  return findPlaceholders(text).reduce(
    (total, group) => total + group.occurrences.length,
    0,
  );
}

// Replaces every occurrence of one placeholder group with the given value.
export function fillPlaceholder(
  text: string,
  placeholder: DraftPlaceholder,
  value: string,
): string {
  let result = text;
  for (const { start, end } of [...placeholder.occurrences].sort(
    (a, b) => b.start - a.start,
  )) {
    result = result.slice(0, start) + value + result.slice(end);
  }
  return result;
}
