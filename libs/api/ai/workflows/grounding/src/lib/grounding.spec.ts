import {
  extractUsedMarkerNumbers,
  filterUsedCitations,
  formatGroundingContextBlock,
  retrieveGroundingCitations,
  type GroundingSearchHit,
} from "./grounding";

function hit(overrides: Partial<GroundingSearchHit>): GroundingSearchHit {
  return {
    id: "chunk-1",
    text: "Zaposleni ima pravo na godišnji odmor u trajanju od najmanje 20 radnih dana.",
    score: 0.8,
    source: {
      title: "Zakon o radu",
      publisher: "Paragraf Lex",
      sourceUrl: "https://www.paragraf.rs/propisi/zakon_o_radu.html",
      jurisdiction: "RS",
    },
    articleNumber: "76",
    paragraphNumber: null,
    pointNumber: null,
    ...overrides,
  };
}

describe("retrieveGroundingCitations", () => {
  it("dedupes hits returned by multiple queries, keeping the best score", async () => {
    const search = jest
      .fn()
      .mockResolvedValueOnce([hit({ id: "a", score: 0.6 })])
      .mockResolvedValueOnce([hit({ id: "a", score: 0.9 })]);

    const citations = await retrieveGroundingCitations(search, ["upit-1", "upit-2"]);

    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({ marker: 1, chunkId: "a", score: 0.9 });
  });

  it("drops hits below the minimum score threshold", async () => {
    const search = jest
      .fn()
      .mockResolvedValue([hit({ id: "a", score: 0.4 }), hit({ id: "b", score: 0.7 })]);

    const citations = await retrieveGroundingCitations(search, ["upit-1"], {
      minScore: 0.5,
    });

    expect(citations.map((citation) => citation.chunkId)).toEqual(["b"]);
  });

  it("caps the number of citations and assigns markers by descending score", async () => {
    const search = jest.fn().mockResolvedValue([
      hit({ id: "a", score: 0.6 }),
      hit({ id: "b", score: 0.9 }),
      hit({ id: "c", score: 0.75 }),
    ]);

    const citations = await retrieveGroundingCitations(search, ["upit-1"], {
      totalLimit: 2,
    });

    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({ marker: 1, chunkId: "b" });
    expect(citations[1]).toMatchObject({ marker: 2, chunkId: "c" });
  });

  it("skips queries shorter than the minimum length", async () => {
    const search = jest.fn().mockResolvedValue([hit({ id: "a" })]);

    await retrieveGroundingCitations(search, ["ok query", "a", "  "]);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("ok query", 4);
  });

  it("truncates long snippets", async () => {
    const longText = "reč ".repeat(200);
    const search = jest.fn().mockResolvedValue([hit({ id: "a", text: longText })]);

    const citations = await retrieveGroundingCitations(search, ["upit-1"], {
      snippetMaxChars: 50,
    });

    expect(citations[0].snippet.length).toBeLessThanOrEqual(50);
    expect(citations[0].snippet.endsWith("…")).toBe(true);
  });
});

describe("formatGroundingContextBlock", () => {
  it("returns an empty string when there are no citations", () => {
    expect(formatGroundingContextBlock([])).toBe("");
  });

  it("renders a numbered line per citation with the article and source", () => {
    const block = formatGroundingContextBlock([
      {
        marker: 1,
        chunkId: "a",
        articleNumber: "76",
        sourceTitle: "Zakon o radu",
        sourceUrl: "https://www.paragraf.rs/propisi/zakon_o_radu.html",
        snippet: "Zaposleni ima pravo na godišnji odmor.",
        score: 0.9,
      },
    ]);

    expect(block).toContain("[1] Član 76 (Zakon o radu)");
    expect(block).toContain("Zaposleni ima pravo na godišnji odmor.");
  });
});

describe("filterUsedCitations", () => {
  it("keeps only citations whose marker was referenced", () => {
    const citations = [
      { marker: 1, chunkId: "a", articleNumber: null, sourceTitle: "", sourceUrl: "", snippet: "", score: 0.9 },
      { marker: 2, chunkId: "b", articleNumber: null, sourceTitle: "", sourceUrl: "", snippet: "", score: 0.8 },
    ];

    expect(filterUsedCitations(citations, [2]).map((c) => c.chunkId)).toEqual(["b"]);
  });
});

describe("extractUsedMarkerNumbers", () => {
  it("extracts unique marker numbers referenced in text", () => {
    expect(
      extractUsedMarkerNumbers("Vidi [1] i [2], a zatim ponovo [1]."),
    ).toEqual([1, 2]);
  });

  it("returns an empty array when no markers are present", () => {
    expect(extractUsedMarkerNumbers("Nema referenci ovde.")).toEqual([]);
  });
});
