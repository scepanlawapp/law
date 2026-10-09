import { FakeChatModelProvider } from "@law/llm";
import { buildBriefUserPrompt } from "./context";
import { DRAFT_DOCUMENT_TYPES } from "@law/api-interfaces";
import {
  DOCUMENT_FAMILY_TEXT,
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

  it("gives every type a unique ASCII file slug and the shared contract ids", () => {
    const types = listDocumentTypes();
    const slugs = types.map((type) => type.fileSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(types.map((type) => type.id)).toEqual([...DRAFT_DOCUMENT_TYPES]);
  });

  it("keeps party roles and field keys unique per type", () => {
    for (const type of listDocumentTypes()) {
      const keys = missingFieldKeys(type);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("covers every family with evidence wording", () => {
    const families = new Set(listDocumentTypes().map((type) => type.family));
    expect([...families].sort()).toEqual([
      "CONTRACT",
      "CORPORATE",
      "LETTER",
      "LITIGATION",
    ]);
    for (const family of families) {
      expect(DOCUMENT_FAMILY_TEXT[family].evidenceDescription).toContain(
        "{label}",
      );
    }
  });

  it("describes the media reply publication date as urgent with its own wording", () => {
    const info = describeMissingField(
      getDocumentType("MEDIA_REPLY_REQUEST"),
      "publicationDate",
    );
    expect(info).toMatchObject({ urgent: true });
    expect(info?.urgentDescription).toContain("datuma objavljivanja");
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
  it("asks contracts for attachments, not evidence", () => {
    const prompt = buildBriefSystemPrompt(getDocumentType("NDA"));
    expect(prompt).toContain("„Ugovor o poverljivosti”");
    expect(prompt).toContain("discloser (strana koja otkriva informacije)");
    expect(prompt).toContain("priloge i isprave potrebne za zaključenje ugovora");
    expect(prompt).toContain("Zakon o zaštiti poslovne tajne");
  });

  it("handles a single-party corporate act", () => {
    const prompt = buildBriefSystemPrompt(getDocumentType("CORPORATE_DECISION"));
    expect(prompt).toContain("company (društvo)");
    expect(prompt).toContain("companyAddress");
    expect(prompt).toContain("Zakon o privrednim društvima");
  });

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

describe("document facts in the brief", () => {
  const facts = [
    {
      ref: "doc:id-1",
      title: "Lična karta Petar",
      subjectType: "PERSON",
      subjectRole: null,
      field: "fullName",
      value: "Petar Petrović",
    },
    {
      ref: "doc:id-1",
      title: "Lična karta Petar",
      subjectType: "PERSON",
      subjectRole: null,
      field: "jmbg",
      value: "0101990710006",
    },
    {
      ref: "doc:apr-1",
      title: "APR izvod Alfa",
      subjectType: "COMPANY",
      subjectRole: null,
      field: "registrationNumber",
      value: "12345678",
    },
  ];
  const budget = { perDocMaxChars: 1000, totalMaxChars: 20000 };
  const base = { userText: "Tužba protiv Alfa d.o.o.", documents: [] };

  it("renders a Serbian facts block with values, refs and the precedence rules", () => {
    const { prompt } = buildBriefUserPrompt(
      { ...base, documentFacts: facts },
      budget,
    );

    expect(prompt).toContain("Činjenice iz dokumenata");
    expect(prompt).toContain("doc:id-1");
    expect(prompt).toContain("Lična karta Petar");
    expect(prompt).toContain("jmbg: 0101990710006");
    expect(prompt).toContain("PERSON");
    expect(prompt).toContain("Podatak iz poruke klijenta ima prednost");
    expect(prompt).toContain("nije nedostajući podatak");
  });

  it("omits the block without facts", () => {
    expect(
      buildBriefUserPrompt({ ...base, documentFacts: [] }, budget).prompt,
    ).not.toContain("Činjenice iz dokumenata");
    expect(buildBriefUserPrompt(base, budget).prompt).not.toContain(
      "Činjenice iz dokumenata",
    );
  });

  it("caps the block at 200 facts, flattens values and never carries quotes", () => {
    const many = Array.from({ length: 250 }, (_, index) => ({
      ref: "doc:big",
      title: "Veliki dokument",
      subjectType: "PERSON",
      subjectRole: null,
      field: "fullName",
      value: `Osoba ${index}\nnova linija`,
      quote: "TAJNI-CITAT",
    }));
    const { prompt, truncated } = buildBriefUserPrompt(
      { ...base, documentFacts: many },
      budget,
    );

    expect(prompt).toContain("Osoba 199 nova linija");
    expect(prompt).not.toContain("Osoba 200");
    expect(prompt).not.toContain("TAJNI-CITAT");
    expect(truncated).toBe(true);
  });

  it("asks the model for a party source only from the provided facts", () => {
    const prompt = buildBriefSystemPrompt(getDocumentType("LAWSUIT"));
    expect(prompt).toContain("source");
    expect(prompt).toContain("Činjenice iz dokumenata");
  });

  describe("party source normalization", () => {
    const type = getDocumentType("LAWSUIT");
    const withSource = (source: { ref: string; title: string }, idNumber = "0101990710006") => ({
      ...fullBrief,
      parties: [
        {
          role: "plaintiff",
          name: "Petar Petrović",
          address: null,
          idNumber,
          source,
        },
        { role: "defendant", name: "Alfa d.o.o.", address: null, idNumber: null },
      ],
    });

    it("keeps a source whose ref and value match a fact and fills the title", () => {
      const brief = normalizeBriefForType(
        withSource({ ref: "doc:id-1", title: "izmišljen naslov" }),
        type,
        { facts },
      );

      expect(brief.parties[0].source).toEqual({
        ref: "doc:id-1",
        title: "Lična karta Petar",
      });
      expect(brief.parties[1]).not.toHaveProperty("source");
    });

    it("matches values ignoring case, diacritics and spacing", () => {
      const brief = normalizeBriefForType(
        {
          ...withSource({ ref: "doc:id-1", title: "" }, "0101990710006"),
          parties: [
            {
              role: "plaintiff",
              name: "PETAR  PETROVIC",
              address: null,
              idNumber: null,
              source: { ref: "doc:id-1", title: "" },
            },
            { role: "defendant", name: null, address: null, idNumber: null },
          ],
        },
        type,
        { facts },
      );

      expect(brief.parties[0].source?.ref).toBe("doc:id-1");
    });

    it("drops the source when the name matches but the idNumber was invented", () => {
      const brief = normalizeBriefForType(
        withSource({ ref: "doc:id-1", title: "x" }, "1111111111111"),
        type,
        { facts },
      );

      expect(brief.parties[0]).not.toHaveProperty("source");
    });

    it("keeps the source when name and idNumber match even if the address differs", () => {
      const input = withSource({ ref: "doc:id-1", title: "x" });
      const brief = normalizeBriefForType(
        {
          ...input,
          parties: [
            { ...input.parties[0], address: "Nova adresa 5, Novi Sad" },
            input.parties[1],
          ],
        },
        type,
        {
        facts: [
          ...facts,
          {
            ref: "doc:id-1",
            title: "Lična karta Petar",
            subjectType: "PERSON",
            subjectRole: null,
            field: "address",
            value: "Stara adresa 1, Beograd",
          },
        ],
        },
      );

      expect(brief.parties[0].source?.ref).toBe("doc:id-1");
    });

    it("keeps the source when the idNumber is null and the name matches", () => {
      const brief = normalizeBriefForType(
        { ...withSource({ ref: "doc:id-1", title: "x" }, "0101990710006") },
        type,
        { facts },
      );
      const nullId = normalizeBriefForType(
        {
          ...fullBrief,
          parties: [
            {
              role: "plaintiff",
              name: "Petar Petrović",
              address: null,
              idNumber: null,
              source: { ref: "doc:id-1", title: "x" },
            },
            { role: "defendant", name: null, address: null, idNumber: null },
          ],
        },
        type,
        { facts },
      );

      expect(brief.parties[0].source?.ref).toBe("doc:id-1");
      expect(nullId.parties[0].source?.ref).toBe("doc:id-1");
    });

    it("drops the source when the name is missing or differs", () => {
      const other = normalizeBriefForType(
        {
          ...fullBrief,
          parties: [
            {
              role: "plaintiff",
              name: "Marko Marković",
              address: null,
              idNumber: "0101990710006",
              source: { ref: "doc:id-1", title: "x" },
            },
            { role: "defendant", name: null, address: null, idNumber: null },
          ],
        },
        type,
        { facts },
      );

      expect(other.parties[0]).not.toHaveProperty("source");
    });

    it("drops a source whose ref is not among the provided facts", () => {
      const invented = normalizeBriefForType(
        withSource({ ref: "doc:izmisljen", title: "Lažni" }),
        type,
        { facts },
      );
      const noFacts = normalizeBriefForType(
        withSource({ ref: "doc:id-1", title: "x" }),
        type,
        { facts: [] },
      );

      expect(invented.parties[0]).not.toHaveProperty("source");
      expect(noFacts.parties[0]).not.toHaveProperty("source");
    });

    it("drops a source when no party value equals a fact value of that ref", () => {
      const brief = normalizeBriefForType(
        withSource({ ref: "doc:apr-1", title: "x" }),
        type,
        { facts },
      );

      expect(brief.parties[0]).not.toHaveProperty("source");
    });

    it("keeps a stored, well-formed source when read back without facts", () => {
      const stored = normalizeBrief({
        ...withSource({ ref: "doc:id-1", title: "Lična karta Petar" }),
      });
      const legacy = normalizeBrief(fullBrief);

      expect(stored.parties[0].source).toEqual({
        ref: "doc:id-1",
        title: "Lična karta Petar",
      });
      expect(legacy.parties[0]).not.toHaveProperty("source");
    });

    it("runs through the runner with the facts", async () => {
      const provider = new FakeChatModelProvider({
        ...llmBrief,
        parties: [
          {
            role: "plaintiff",
            name: "Petar Petrović",
            address: null,
            idNumber: "0101990710006",
            source: { ref: "doc:id-1" },
          },
          {
            role: "defendant",
            name: "Alfa d.o.o.",
            address: null,
            idNumber: null,
            source: { ref: "doc:nema" },
          },
        ],
      });

      const brief = await runBriefExtractionLlm(
        provider,
        "Poruka klijenta:\nTužba",
        "LAWSUIT",
        facts,
      );

      expect(brief.parties[0].source).toEqual({
        ref: "doc:id-1",
        title: "Lična karta Petar",
      });
      expect(brief.parties[1]).not.toHaveProperty("source");
    });
  });
});

describe("missing fields reconciled with filled party values", () => {
  it("drops party missing-field entries whose value is filled and keeps the rest", () => {
    const type = getDocumentType("LAWSUIT");
    const brief = normalizeBriefForType(
      {
        ...fullBrief,
        parties: [
          {
            role: "plaintiff",
            name: "Petar Petrović",
            address: "Knez Mihailova 1, Beograd",
            idNumber: "0101990710006",
          },
          { role: "defendant", name: "Alfa d.o.o.", address: null, idNumber: null },
        ],
        missingFields: [
          { key: "plaintiffAddress", label: "Adresa tužioca" },
          { key: "plaintiffIdNumber", label: "JMBG / matični broj tužioca" },
          { key: "plaintiffName", label: "Ime tužioca" },
          { key: "defendantAddress", label: "Adresa tuženog" },
          { key: "competentCourt", label: "Nadležni sud" },
        ],
      },
      type,
    );

    expect(brief.missingFields.map((item) => item.key)).toEqual([
      "defendantAddress",
      "competentCourt",
    ]);
  });
});
