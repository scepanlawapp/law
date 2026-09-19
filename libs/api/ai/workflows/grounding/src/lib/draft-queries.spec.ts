import type { BriefResult } from "@law/brief-extraction";
import { buildDraftGroundingQueries } from "./draft-queries";

const baseBrief: BriefResult = {
  jobType: "lawsuit",
  plaintiff: { name: "Petar Petrović", address: "Knez Mihailova 1, Beograd" },
  defendant: { name: "Marko Marković", address: null },
  competentCourt: "Prvi osnovni sud u Beogradu",
  claimValue: "150.000 RSD",
  legalBasis: ["ZOO čl. 154", "Zakon o radu čl. 76"],
  factualDescription: "Poslodavac nije isplatio naknadu za neiskorišćeni odmor.",
  evidence: ["ugovor.pdf"],
  reliefSought: "Isplata naknade za neiskorišćeni godišnji odmor.",
  missingFields: [],
  confidence: 0.8,
  warnings: [],
};

describe("buildDraftGroundingQueries", () => {
  it("builds one query per legal basis entry plus factual description and claim summary", () => {
    const queries = buildDraftGroundingQueries(baseBrief);

    expect(queries).toContain("ZOO čl. 154");
    expect(queries).toContain("Zakon o radu čl. 76");
    expect(queries).toContain(
      "Poslodavac nije isplatio naknadu za neiskorišćeni odmor.",
    );
    expect(queries).toContain(
      "lawsuit Isplata naknade za neiskorišćeni godišnji odmor.",
    );
  });

  it("skips null/empty fields and dedupes identical entries", () => {
    const brief: BriefResult = {
      ...baseBrief,
      legalBasis: ["ista odredba", "ista odredba"],
      factualDescription: null,
      reliefSought: null,
      jobType: null,
    };

    expect(buildDraftGroundingQueries(brief)).toEqual(["ista odredba"]);
  });
});
