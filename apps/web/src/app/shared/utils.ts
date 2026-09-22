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

export function createSelectItemToString<TValue extends string = string>(
  options: ReadonlyArray<SelectOption<TValue>>,
  translate: (key: string) => string,
): (value: TValue | string | null | undefined) => string {
  return (value: TValue | string | null | undefined) =>
    getSelectOptionLabel(value, options, translate);
}

type Gender = "MALE" | "FEMALE";

export function nameInVocative(name: string, gender: Gender): string {
  if (!name?.trim()) {
    return name;
  }

  const original = name.trim();
  const lower = original.toLocaleLowerCase("sr-Latn");

  const maleExceptions: Record<string, string> = {
    petar: "Petre",
    aleksandar: "Aleksandre",
    miloš: "Miloše",

    pera: "Pero",
    paja: "Pajo",
    žika: "Žiko",
    miša: "Mišo",
  };

  const femaleExceptions: Record<string, string> = {
    maja: "Majo",
    sara: "Saro",
    mara: "Maro",
    mira: "Miro",

    ana: "Ana",
    anja: "Anja",
    sanja: "Sanja",
    sonja: "Sonja",
    vesna: "Vesna",
    branka: "Branka",
    tara: "Tara",
    zorka: "Zorka",
  };

  if (gender === "MALE") {
    const exception = maleExceptions[lower];

    if (exception) {
      return applyOriginalCase(original, exception);
    }

    // Perica -> Perice
    // Jovica -> Jovice
    if (lower.endsWith("ica")) {
      return original.slice(0, -1) + "e";
    }

    // Andrej -> Andreju
    // Sergej -> Sergeju
    if (lower.endsWith("j")) {
      return original + "u";
    }

    // Marko -> Marko
    // Pavle -> Pavle
    // Nikola -> Nikola
    // Nemanja -> Nemanja
    if (lower.endsWith("o") || lower.endsWith("e") || lower.endsWith("a")) {
      return original;
    }

    // Vuk -> Vuče
    if (lower.endsWith("k")) {
      return original.slice(0, -1) + "če";
    }

    // Predrag -> Predraže
    if (lower.endsWith("g")) {
      return original.slice(0, -1) + "že";
    }

    // Mih -> Miše, theoretically
    if (lower.endsWith("h")) {
      return original.slice(0, -1) + "še";
    }

    // Milan -> Milane
    // Jovan -> Jovane
    // Nenad -> Nenade
    // Lazar -> Lazare
    if (/[bcčćdđfglmnprsštvzž]$/i.test(lower)) {
      return original + "e";
    }

    return original;
  }

  if (gender === "FEMALE") {
    const exception = femaleExceptions[lower];

    if (exception) {
      return applyOriginalCase(original, exception);
    }

    // Milica -> Milice
    // Danica -> Danice
    // Ljubica -> Ljubice
    if (lower.endsWith("ica")) {
      return original.slice(0, -1) + "e";
    }

    // Jelena -> Jelena
    // Marija -> Marija
    // Dragana -> Dragana
    if (lower.endsWith("a")) {
      return original;
    }

    // Ines -> Ines
    // Doris -> Doris
    // Karmen -> Karmen
    return original;
  }

  return original;
}

function applyOriginalCase(original: string, transformed: string): string {
  if (original === original.toUpperCase()) {
    return transformed.toUpperCase();
  }

  if (
    original[0] === original[0]?.toUpperCase() &&
    original.slice(1) === original.slice(1).toLowerCase()
  ) {
    return transformed.charAt(0).toUpperCase() + transformed.slice(1);
  }

  return transformed;
}
