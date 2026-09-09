export type Script = "LATIN" | "CYRILLIC" | "MIXED" | "NONE";

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  ђ: "đ",
  е: "e",
  ж: "ž",
  з: "z",
  и: "i",
  ј: "j",
  к: "k",
  л: "l",
  љ: "lj",
  м: "m",
  н: "n",
  њ: "nj",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  ћ: "ć",
  у: "u",
  ф: "f",
  х: "h",
  ц: "c",
  ч: "č",
  џ: "dž",
  ш: "š",
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Ђ: "Đ",
  Е: "E",
  Ж: "Ž",
  З: "Z",
  И: "I",
  Ј: "J",
  К: "K",
  Л: "L",
  Љ: "Lj",
  М: "M",
  Н: "N",
  Њ: "Nj",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  Ћ: "Ć",
  У: "U",
  Ф: "F",
  Х: "H",
  Ц: "C",
  Ч: "Č",
  Џ: "Dž",
  Ш: "Š",
};

const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: "а",
  b: "б",
  v: "в",
  g: "г",
  d: "д",
  đ: "ђ",
  e: "е",
  ž: "ж",
  z: "з",
  i: "и",
  j: "ј",
  k: "к",
  l: "л",
  m: "м",
  n: "н",
  o: "о",
  p: "п",
  r: "р",
  s: "с",
  t: "т",
  ć: "ћ",
  u: "у",
  f: "ф",
  h: "х",
  c: "ц",
  č: "ч",
  š: "ш",
  A: "А",
  B: "Б",
  V: "В",
  G: "Г",
  D: "Д",
  Đ: "Ђ",
  E: "Е",
  Ž: "Ж",
  Z: "З",
  I: "И",
  J: "Ј",
  K: "К",
  L: "Л",
  M: "М",
  N: "Н",
  O: "О",
  P: "П",
  R: "Р",
  S: "С",
  T: "Т",
  Ć: "Ћ",
  U: "У",
  F: "Ф",
  H: "Х",
  C: "Ц",
  Č: "Ч",
  Š: "Ш",
};

const LATIN_DIGRAPHS: Record<string, string> = {
  lj: "љ",
  Lj: "Љ",
  LJ: "Љ",
  nj: "њ",
  Nj: "Њ",
  NJ: "Њ",
  dž: "џ",
  Dž: "Џ",
  DŽ: "Џ",
};

// Word prefixes where "nj"/"dž" are two separate letters, not a digraph.
const SPLIT_DIGRAPH_PREFIXES = [
  "injek",
  "konjunk",
  "konjug",
  "nadž",
  "odžive",
  "podžup",
];

// Tokens kept in Latin inside Cyrillic output (ISO codes, system markers).
const LATIN_ONLY_TOKENS = new Set([
  "EUR",
  "RSD",
  "USD",
  "CHF",
  "GBP",
  "IBAN",
  "SWIFT",
  "URL",
  "PDF",
  "DOCX",
]);

const PROTECTED_SPAN =
  /\[UNOS POTREBAN:[^\]]*\]|https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.-]+/g;

const WORD = /[A-Za-zČĆŽŠĐčćžšđ]+/g;
const FOREIGN_LETTER = /[qwxyQWXY]/;

const CYRILLIC_LETTER = /[\u0400-\u04FF]/;
const LATIN_LETTER = /[A-Za-zČĆŽŠĐčćžšđ]/;

function isUpper(ch: string | undefined): boolean {
  return ch !== undefined && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

export function toLatin(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const mapped = CYRILLIC_TO_LATIN[ch];
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    if (mapped.length === 2 && isUpper(ch)) {
      const next = text[i + 1];
      const prev = text[i - 1];
      const endsWord = next === undefined || !CYRILLIC_LETTER.test(next);
      const allCaps = isUpper(next) || (endsWord && isUpper(prev));
      out += allCaps ? mapped.toUpperCase() : mapped;
      continue;
    }
    out += mapped;
  }
  return out;
}

function wordToCyrillic(word: string): string {
  if (FOREIGN_LETTER.test(word) || LATIN_ONLY_TOKENS.has(word)) {
    return word;
  }
  const lower = word.toLowerCase();
  const splitPrefix = SPLIT_DIGRAPH_PREFIXES.find((p) => lower.startsWith(p));
  let out = "";
  let i = 0;
  while (i < word.length) {
    const pair = word.slice(i, i + 2);
    const digraph = LATIN_DIGRAPHS[pair];
    const insideSplitPrefix =
      splitPrefix !== undefined && i + 1 < splitPrefix.length;
    if (digraph !== undefined && !insideSplitPrefix) {
      out += digraph;
      i += 2;
      continue;
    }
    out += LATIN_TO_CYRILLIC[word[i]] ?? word[i];
    i += 1;
  }
  return out;
}

export function toCyrillic(text: string): string {
  const parts: string[] = [];
  let last = 0;
  for (const match of text.matchAll(PROTECTED_SPAN)) {
    const start = match.index ?? 0;
    parts.push(text.slice(last, start).replace(WORD, wordToCyrillic));
    parts.push(match[0]);
    last = start + match[0].length;
  }
  parts.push(text.slice(last).replace(WORD, wordToCyrillic));
  return parts.join("");
}

export function detectScript(text: string): Script {
  let cyrillic = 0;
  let latin = 0;
  for (const ch of text) {
    if (CYRILLIC_LETTER.test(ch)) cyrillic += 1;
    else if (LATIN_LETTER.test(ch)) latin += 1;
  }
  const total = cyrillic + latin;
  if (total === 0) return "NONE";
  if (cyrillic / total >= 0.1 && latin / total >= 0.1) return "MIXED";
  return cyrillic > latin ? "CYRILLIC" : "LATIN";
}
