import { FakeChatModelProvider } from "@law/llm";
import { buildBriefUserPrompt } from "./context";
import {
  describeMissingField,
  getDocumentType,
  listDocumentTypes,
  missingFieldKeys,
} from "./document-types";
import { humanize, normalizeEvidence, normalizeMissingFields } from "./normalize";
import { normalizeBrief, normalizeBriefForType } from "./normalize-brief";
import { buildBriefSystemPrompt } from "./prompts";
import { runBriefExtractionLlm } from "./runner";
import { briefLlmOutputSchema, briefResultSchema } from "./schema";

const llmBrief = {
  parties: [
    {
      role: "plaintiff",
      name: "Petar Petrović",
      address: "Knez Mihailova 1, Beograd",
      idNumber: null,
    },
    { role: "defendant", name: "Marko Marković", address: null, idNumber: null },
  ],
  fields: [
    { key: "competentCourt", value: "Prvi osnovni sud u Beogradu" },
    { key: "claimValue", value: "150.000 RSD" },
    { key: "reliefSought", value: "Isplata naknade štete u iznosu od 150.000 RSD." },
  ],
  legalBasis: ["ZOO čl. 154"],
  factualDescription: "Tuženi nije isplatio naknadu štete.",
  evidence: [{ label: "ugovor.pdf", provided: true }],
  missingFields: [],
  confidence: 0.8,
  warnings: [],
};

const fullBrief = {
  ...llmBrief,
  documentType: "LAWSUIT" as const,
  fields: [
    ...llmBrief.fields,
    { key: "serviceDate", value: null },
    { key: "contractReference", value: null },
  ],
};

describe("brief-extraction schema", () => {
  it("parses a fully populated brief", () => {
    expect(briefResultSchema.parse(fullBrief)).toEqual(fullBrief);
  });

  it("defaults array fields and allows nulls for missing facts", () => {
    const parsed = briefLlmOutputSchema.parse({
      factualDescription: null,
      confidence: 0.1,
    });
    expect(parsed.parties).toEqual([]);
    expect(parsed.fields).toEqual([]);
    expect(parsed.legalBasis).toEqual([]);
    expect(parsed.evidence).toEqual([]);
    expect(parsed.missingFields).toEqual([]);
    expect(parsed.warnings).toEqual([]);
  });

  it("rejects an unknown document type", () => {
    expect(() =>
      briefResultSchema.parse({ ...fullBrief, documentType: "POEM" }),
    ).toThrow();
  });
});

describe("document types", () => {
  it("defines every type with a default client party and sections", () => {
    for (const type of listDocumentTypes()) {
      expect(type.parties.map((party) => party.role)).toContain(
        type.defaultClientRole,
      );
      expect(type.structure.length).toBeGreaterThan(0);
      expect(type.fields.filter((field) => field.caseName)).toHaveLength(1);
    }
  });

  it("keeps the lawsuit missing-field keys", () => {
    expect(missingFieldKeys(getDocumentType("LAWSUIT"))).toEqual(
      expect.arrayContaining([
        "plaintiffName",
        "defendantAddress",
        "competentCourt",
        "claimValue",
        "reliefSought",
        "serviceDate",
        "contractReference",
        "legalBasis",
        "factualDescription",
      ]),
    );
  });

  it("describes party and field keys per type", () => {
    const appeal = getDocumentType("APPEAL");
    expect(describeMissingField(appeal, "opponentAddress")).toEqual({
      label: "Adresa protivne strane",
      taskTitle: "Pribaviti adresu protivne strane",
      urgent: false,
    });
    expect(describeMissingField(appeal, "serviceDate")?.urgent).toBe(true);
    expect(describeMissingField(appeal, "plaintiffName")).toBeNull();
  });
});

describe("buildBriefSystemPrompt", () => {
  it("names the document, its parties, fields and allowed keys", () => {
    const prompt = buildBriefSystemPrompt(getDocumentType("APPEAL"));
    expect(prompt).toContain("„Žalba”");
    expect(prompt).toContain("appellant (žalilac)");
    expect(prompt).toContain("contestedDecision");
    expect(prompt).toContain("appellantAddress");
    expect(prompt).toContain("Nikada ne izmišljaj");
    expect(prompt).not.toContain("Stojković");
  });
});

describe("brief normalization", () => {
  it("reads a v1 lawsuit brief as LAWSUIT", () => {
    const brief = normalizeBrief({
      jobType: "lawsuit",
      plaintiff: { name: "Petar Petrović", address: "Knez Mihailova 1" },
      defendant: { name: "Marko Marković", address: null },
      competentCourt: "Prvi osnovni sud u Beogradu",
      claimValue: "150.000 RSD",
      legalBasis: ["ZOO čl. 154"],
      factualDescription: "Tuženi nije platio.",
      evidence: ["ugovor.pdf"],
      reliefSought: "Isplata",
      missingFields: ["defendant.address"],
      confidence: 0.7,
      warnings: [],
    });
    expect(brief.documentType).toBe("LAWSUIT");
    expect(brief.parties).toEqual([
      { role: "plaintiff", name: "Petar Petrović", address: "Knez Mihailova 1", idNumber: null },
      { role: "defendant", name: "Marko Marković", address: null, idNumber: null },
    ]);
    expect(brief.fields).toEqual([
      { key: "competentCourt", value: "Prvi osnovni sud u Beogradu" },
      { key: "claimValue", value: "150.000 RSD" },
      { key: "reliefSought", value: "Isplata" },
      { key: "serviceDate", value: null },
      { key: "contractReference", value: null },
    ]);
    expect(brief.evidence).toEqual([{ label: "ugovor.pdf", provided: false }]);
    expect(brief.missingFields).toEqual([
      { key: "defendantAddress", label: "Adresa tuženog" },
    ]);
  });

  it("reads a v2 brief and tolerates garbage", () => {
    expect(normalizeBrief({ ...fullBrief, documentType: "APPEAL" }).parties.map(
      (party) => party.role,
    )).toEqual(["appellant", "opponent"]);
    const empty = normalizeBrief(null);
    expect(empty.documentType).toBe("LAWSUIT");
    expect(empty.parties).toHaveLength(2);
    expect(empty.confidence).toBe(0);
  });

  it("orders parties and fields by the type and turns foreign keys into other", () => {
    const brief = normalizeBriefForType({
      documentType: "APPEAL",
      parties: [
        { role: "opponent", name: " Firma d.o.o. ", address: null, idNumber: null },
        { role: "witness", name: "X", address: null, idNumber: null },
      ],
      fields: [{ key: "appealGrounds", value: "Pogrešna primena prava" }],
      legalBasis: [],
      factualDescription: null,
      evidence: [],
      missingFields: [
        { key: "serviceDate", label: "" },
        { key: "plaintiffAddress", label: "Adresa tužioca" },
      ],
      confidence: 0.5,
      warnings: [],
    });
    expect(brief.parties.map((party) => [party.role, party.name])).toEqual([
      ["appellant", null],
      ["opponent", "Firma d.o.o."],
    ]);
    expect(brief.fields.find((field) => field.key === "appealGrounds")?.value).toBe(
      "Pogrešna primena prava",
    );
    expect(brief.missingFields).toEqual([
      { key: "serviceDate", label: "Datum dostavljanja osporenog akta" },
      { key: "other", label: "Adresa tužioca" },
    ]);
  });
});

describe("missing field normalization", () => {
  it("maps legacy string keys to canonical keys with Serbian labels", () => {
    expect(
      normalizeMissingFields([
        "defendant.address",
        "competentCourt",
        "datum_dostavljanja_resenja",
        "razlog_za_otkaz",
        "JMBG tužioca",
        "adresa za dostavljanje",
      ]),
    ).toEqual([
      { key: "defendantAddress", label: "Adresa tuženog" },
      { key: "competentCourt", label: "Nadležni sud" },
      { key: "serviceDate", label: "Datum dostavljanja osporenog akta" },
      { key: "other", label: "Razlog za otkaz" },
      { key: "plaintiffIdNumber", label: "JMBG / matični broj tužioca" },
      { key: "other", label: "Adresa za dostavljanje" },
    ]);
  });

  it("keeps model labels and turns unknown keys into other", () => {
    expect(
      normalizeMissingFields([
        { key: "claimValue", label: "Vrednost spora" },
        { key: "workStartDate", label: "Datum zasnivanja radnog odnosa" },
        { key: "other", label: "" },
        null,
      ]),
    ).toEqual([
      { key: "claimValue", label: "Vrednost spora" },
      { key: "other", label: "Datum zasnivanja radnog odnosa" },
    ]);
  });

  it("keeps unknown camelCase keys when no type is given", () => {
    expect(
      normalizeMissingFields(
        [{ key: "appellantAddress", label: "" }, "defendant.address"],
        null,
      ),
    ).toEqual([
      { key: "appellantAddress", label: "" },
      { key: "defendantAddress", label: "Adresa tuženog" },
    ]);
  });

  it("parses legacy string output through the schema", () => {
    const parsed = briefResultSchema.parse({
      ...fullBrief,
      evidence: ["ugovor.pdf"],
      missingFields: ["plaintiff.address"],
    });
    expect(parsed.evidence).toEqual([{ label: "ugovor.pdf", provided: false }]);
    expect(parsed.missingFields).toEqual([
      { key: "plaintiffAddress", label: "Adresa tužioca" },
    ]);
  });

  it("normalizes evidence objects", () => {
    expect(
      normalizeEvidence([{ label: " Rešenje o otkazu ", provided: true }, 3]),
    ).toEqual([{ label: "Rešenje o otkazu", provided: true }]);
  });

  it("humanizes identifiers but keeps natural phrases", () => {
    expect(humanize("opposingPartyAddress")).toBe("Opposing party address");
    expect(humanize("JMBG tužioca")).toBe("JMBG tužioca");
  });
});

describe("buildBriefUserPrompt", () => {
  const budget = { perDocMaxChars: 20, totalMaxChars: 200 };

  it("includes user text and completed document text", () => {
    const result = buildBriefUserPrompt(
      {
        userText: "Tužba za naknadu štete",
        documents: [
          {
            id: "doc-1",
            name: "ugovor.pdf",
            mimeType: "application/pdf",
            status: "COMPLETED",
            text: "Kratak tekst ugovora",
          },
        ],
      },
      budget,
    );

    expect(result.prompt).toContain("Tužba za naknadu štete");
    expect(result.prompt).toContain("ugovor.pdf");
    expect(result.prompt).toContain("Kratak tekst ugovora");
    expect(result.truncated).toBe(false);
  });

  it("renders status-only lines for failed/unsupported attachments", () => {
    const result = buildBriefUserPrompt(
      {
        userText: "",
        documents: [
          {
            id: "doc-1",
            name: "scan.png",
            mimeType: "image/png",
            status: "FAILED",
          },
          {
            id: "doc-2",
            name: "note.exe",
            mimeType: "application/x-msdownload",
            status: "UNSUPPORTED",
          },
        ],
      },
      budget,
    );

    expect(result.prompt).toContain("scan.png");
    expect(result.prompt).toContain("status FAILED");
    expect(result.prompt).toContain("note.exe");
    expect(result.prompt).toContain("status UNSUPPORTED");
  });

  it("truncates a single document longer than the per-document budget", () => {
    const longText = "a".repeat(50);
    const result = buildBriefUserPrompt(
      {
        userText: "",
        documents: [
          {
            id: "doc-1",
            name: "veliki.txt",
            mimeType: "text/plain",
            status: "COMPLETED",
            text: longText,
          },
        ],
      },
      budget,
    );

    expect(result.truncated).toBe(true);
    expect(result.prompt).toContain("a".repeat(20));
    expect(result.prompt).not.toContain("a".repeat(21));
  });

  it("drops the lowest-priority document when the total budget is exceeded", () => {
    const tightBudget = { perDocMaxChars: 1000, totalMaxChars: 120 };
    const result = buildBriefUserPrompt(
      {
        userText: "Kratka poruka",
        documents: [
          {
            id: "doc-1",
            name: "prvi.txt",
            mimeType: "text/plain",
            status: "COMPLETED",
            text: "Prvi dokument sadrži bitne činjenice o sporu.",
          },
          {
            id: "doc-2",
            name: "drugi.txt",
            mimeType: "text/plain",
            status: "COMPLETED",
            text: "Drugi dokument je manje bitan prilog.",
          },
        ],
      },
      tightBudget,
    );

    expect(result.truncated).toBe(true);
    expect(result.promptChars).toBeLessThanOrEqual(tightBudget.totalMaxChars);
    expect(result.prompt).toContain("prvi.txt");
  });
});

describe("runBriefExtractionLlm", () => {
  it("resolves a structured brief for the requested type", async () => {
    const provider = new FakeChatModelProvider(llmBrief);

    await expect(
      runBriefExtractionLlm(provider, "Poruka klijenta:\nTužba", "LAWSUIT"),
    ).resolves.toEqual(fullBrief);
  });

  it("rejects when the provider returns an invalid shape", async () => {
    const provider = new FakeChatModelProvider({ jobType: "lawsuit" });

    await expect(
      runBriefExtractionLlm(provider, "Poruka klijenta:\nTužba", "LAWSUIT"),
    ).rejects.toThrow();
  });
});
