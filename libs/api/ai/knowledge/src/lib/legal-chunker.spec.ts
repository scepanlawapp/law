import { chunkLegalText } from "./legal-chunker";

describe("chunkLegalText", () => {
  const metadata = {
    sourceUrl: "https://example.test/zakon-o-radu",
    canonicalUrl: "https://example.test/zakon-o-radu",
    title: "Zakon o radu",
    publisher: "Example",
    jurisdiction: "RS",
    language: "sr" as const,
    retrievedAt: "2026-09-19T00:00:00.000Z",
    contentHash: "hash",
  };

  it("normalizes Cyrillic and preserves article and paragraph metadata", () => {
    const chunks = chunkLegalText(
      [
        "Члан 1.",
        "(1) Овим законом уређују се права.",
        "(2) Одредбе се примењују на запослене.",
        "Члан 2.",
        "1. Послодавац је дужан да поштује закон.",
      ].join("\n"),
      metadata,
    );

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual(
      expect.objectContaining({ articleNumber: "1", paragraphNumber: 1 }),
    );
    expect(chunks[0]?.text).toContain("Ovim zakonom uređuju se prava.");
    expect(chunks[1]).toEqual(
      expect.objectContaining({ articleNumber: "1", paragraphNumber: 2 }),
    );
    expect(chunks[2]).toEqual(
      expect.objectContaining({ articleNumber: "2", pointNumber: 1 }),
    );
    expect(chunks[0]?.metadata.sourceScript).toBe("CYRILLIC");
  });

  it("splits oversized legal text without losing order", () => {
    const chunks = chunkLegalText(
      ["Član 10.", "(1) " + "a".repeat(40), "(2) " + "b".repeat(40)].join("\n"),
      metadata,
      { maxChars: 50 },
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual(
      chunks.map((_, index) => index),
    );
    expect(chunks.map((chunk) => chunk.text).join("\n")).toContain("b");
  });

  it("returns no chunks for empty input", () => {
    expect(chunkLegalText("\n  ", metadata)).toEqual([]);
  });
});
