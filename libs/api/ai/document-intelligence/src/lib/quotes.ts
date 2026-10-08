import { toLatin } from "@law/transliteration";

interface Folded {
  text: string;
  /** Index in the original text of every folded character. */
  origin: number[];
}

/**
 * Lower-case, Latin, diacritic-free text with whitespace runs collapsed, plus
 * the original index of every folded character. Transliteration runs per
 * character so a digraph (њ -> nj) never shifts the offsets.
 */
function foldWithOrigin(input: string): Folded {
  let text = "";
  const origin: number[] = [];
  let lastWasSpace = false;
  for (let index = 0; index < input.length; index += 1) {
    const latin = toLatin(input[index]);
    for (const char of latin) {
      if (/\s/.test(char)) {
        if (!lastWasSpace && text.length) {
          text += " ";
          origin.push(index);
        }
        lastWasSpace = true;
        continue;
      }
      lastWasSpace = false;
      const plain = char
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d");
      for (const p of plain) {
        text += p;
        origin.push(index);
      }
    }
  }
  if (text.endsWith(" ")) {
    text = text.slice(0, -1);
    origin.pop();
  }
  return { text, origin };
}

/** Case, script, diacritic and whitespace insensitive form used for matching. */
export function foldForMatch(text: string): string {
  return foldWithOrigin(text).text;
}

/**
 * Offset of `quote` in the ORIGINAL text, found case-, script-, diacritic-
 * and whitespace-insensitively; null when the quote is empty or absent.
 */
export function locateQuote(text: string, quote: string): number | null {
  const needle = foldForMatch(quote);
  if (!needle) {
    return null;
  }
  const folded = foldWithOrigin(text);
  const position = folded.text.indexOf(needle);
  return position === -1 ? null : folded.origin[position];
}
