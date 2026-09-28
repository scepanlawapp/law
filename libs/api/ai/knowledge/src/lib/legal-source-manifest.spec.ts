import {
  PARAGRAF_CORE_SOURCES,
  PARAGRAF_PROPISI_BASE_URL,
} from "./legal-source-manifest";
import { PARAGRAF_LABOR_LAW_URL } from "./legal-source-parser";

describe("PARAGRAF_CORE_SOURCES", () => {
  it("has unique slugs and urls", () => {
    const slugs = PARAGRAF_CORE_SOURCES.map((entry) => entry.slug);
    const urls = PARAGRAF_CORE_SOURCES.map((entry) => entry.url);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("only points at Paragraf law pages with kebab-case slugs", () => {
    for (const entry of PARAGRAF_CORE_SOURCES) {
      expect(entry.url.startsWith(PARAGRAF_PROPISI_BASE_URL)).toBe(true);
      expect(entry.url).toMatch(/\.html$/);
      expect(entry.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(entry.area).toBeTruthy();
    }
  });

  it("keeps the existing Zakon o radu source identity", () => {
    expect(PARAGRAF_CORE_SOURCES).toContainEqual({
      slug: "zakon-o-radu",
      url: PARAGRAF_LABOR_LAW_URL,
      area: "labor",
    });
  });
});
