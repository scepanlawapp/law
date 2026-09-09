import { detectScript, toCyrillic, toLatin } from "./transliteration";

describe("toLatin", () => {
  it("maps all Cyrillic letters including digraphs", () => {
    expect(
      toLatin("Љубљана, Његош, Џак, ђак, ћирилица, чаша, шума, жаба"),
    ).toBe("Ljubljana, Njegoš, Džak, đak, ćirilica, čaša, šuma, žaba");
  });

  it("uppercases digraphs inside all-caps words", () => {
    expect(toLatin("ЉУБЉАНА")).toBe("LJUBLJANA");
    expect(toLatin("ЊЕГОШ")).toBe("NJEGOŠ");
    expect(toLatin("ВИШИ СУД У БЕОГРАДУ")).toBe("VIŠI SUD U BEOGRADU");
    expect(toLatin("ПЕТРОВИЋ Љ.")).toBe("PETROVIĆ Lj.");
  });

  it("leaves Latin text, digits and punctuation untouched", () => {
    const input = "Tužilac Marko Marković, čl. 192 ZPP, 12.000,00 RSD";
    expect(toLatin(input)).toBe(input);
  });
});

describe("toCyrillic", () => {
  it("converts Latin text with digraphs", () => {
    expect(toCyrillic("Ljubljana, Njegoš, džak, đak, ćirilica")).toBe(
      "Љубљана, Његош, џак, ђак, ћирилица",
    );
    expect(toCyrillic("LJUBLJANA NJEGOŠ DŽAK")).toBe("ЉУБЉАНА ЊЕГОШ ЏАК");
  });

  it("converts legal abbreviations and citations", () => {
    expect(toCyrillic("Na osnovu čl. 192. st. 1. ZPP i čl. 262. ZOO")).toBe(
      "На основу чл. 192. ст. 1. ЗПП и чл. 262. ЗОО",
    );
  });

  it("keeps placeholders, URLs, emails and ISO codes in Latin", () => {
    expect(
      toCyrillic(
        "Tuženi: [UNOS POTREBAN: adresa tuženog], iznos 500 EUR, kontakt test@firma.rs ili https://sud.rs/x",
      ),
    ).toBe(
      "Тужени: [UNOS POTREBAN: adresa tuženog], износ 500 EUR, контакт test@firma.rs или https://sud.rs/x",
    );
  });

  it("does not convert foreign words containing q, w, x, y", () => {
    expect(toCyrillic("Ugovor sa Microsoft Windows i Xerox")).toBe(
      "Уговор са Мицрософт Windows и Xerox",
    );
  });

  it("splits n+j and d+ž in known exception words", () => {
    expect(toCyrillic("injekcija konjunktura nadživeti")).toBe(
      "инјекција конјунктура надживети",
    );
    expect(toCyrillic("konj")).toBe("коњ");
  });

  it("preserves Markdown structure", () => {
    expect(toCyrillic("## Tužbeni zahtev\n\n- Dokaz 1\n- Dokaz 2")).toBe(
      "## Тужбени захтев\n\n- Доказ 1\n- Доказ 2",
    );
  });

  it("round-trips a typical draft paragraph", () => {
    const latin =
      "Osnovnom sudu u Novom Sadu. Tužilac Petar Petrović iz Novog Sada, ulica Njegoševa 5, protiv tuženog Preduzeća Ljubičica d.o.o.";
    expect(toLatin(toCyrillic(latin))).toBe(latin);
  });
});

describe("detectScript", () => {
  it("detects scripts", () => {
    expect(detectScript("Пресуда Основног суда")).toBe("CYRILLIC");
    expect(detectScript("Presuda Osnovnog suda")).toBe("LATIN");
    expect(detectScript("Presuda Основног суда")).toBe("MIXED");
    expect(detectScript("12345 ---")).toBe("NONE");
  });

  it("ignores a stray Latin token in Cyrillic text", () => {
    expect(
      detectScript("Пресуда Основног суда у Београду, износ 500 EUR"),
    ).toBe("CYRILLIC");
  });
});
