import type { BriefResult } from "@law/brief-extraction";
import { buildDraftGroundingQueries } from "./draft-queries";

const baseBrief: BriefResult = {
  documentType: "LAWSUIT",
  parties: [
    { role: "plaintiff", name: "Petar Petrović", address: "Knez Mihailova 1, Beograd", idNumber: null },
    { role: "defendant", name: "Marko Marković", address: null, idNumber: null },
  ],
  fields: [
    { key: "competentCourt", value: "Prvi osnovni sud u Beogradu" },
    { key: "claimValue", value: "150.000 RSD" },
    { key: "reliefSought", value: "Isplata naknade za neiskorišćeni godišnji odmor." },
  ],
  legalBasis: ["ZOO čl. 154", "Zakon o radu čl. 76"],
  factualDescription:
    "Poslodavac nije isplatio naknadu za neiskorišćeni odmor.",
  evidence: [{ label: "ugovor.pdf", provided: true }],
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
      "Tužba Isplata naknade za neiskorišćeni godišnji odmor.",
    );
  });

  it("skips null/empty fields and dedupes identical entries", () => {
    const brief: BriefResult = {
      ...baseBrief,
      legalBasis: ["ista odredba", "ista odredba"],
      factualDescription: null,
      fields: [],
    };

    expect(buildDraftGroundingQueries(brief)).toEqual(["ista odredba", "Tužba"]);
  });

  it("uses the purpose field of other document types", () => {
    const brief: BriefResult = {
      ...baseBrief,
      documentType: "APPEAL",
      legalBasis: [],
      factualDescription: null,
      fields: [{ key: "contestedDecision", value: "Presuda P 12/2026" }],
    };

    expect(buildDraftGroundingQueries(brief)).toEqual(["Žalba Presuda P 12/2026"]);
  });
});
