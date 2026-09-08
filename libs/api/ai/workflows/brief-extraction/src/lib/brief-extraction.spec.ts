import { FakeChatModelProvider } from "@law/llm";
import { buildBriefUserPrompt } from "./context";
import { runBriefExtractionLlm } from "./runner";
import { briefResultSchema } from "./schema";

const fullBrief = {
  jobType: "lawsuit",
  plaintiff: { name: "Petar Petrović", address: "Knez Mihailova 1, Beograd" },
  defendant: { name: "Marko Marković", address: null },
  competentCourt: "Prvi osnovni sud u Beogradu",
  claimValue: "150.000 RSD",
  legalBasis: ["ZOO čl. 154"],
  factualDescription: "Tuženi nije isplatio naknadu štete.",
  evidence: ["ugovor.pdf"],
  reliefSought: "Isplata naknade štete u iznosu od 150.000 RSD.",
  missingFields: [],
  confidence: 0.8,
  warnings: [],
};

describe("brief-extraction schema", () => {
  it("parses a fully populated brief", () => {
    expect(briefResultSchema.parse(fullBrief)).toEqual(fullBrief);
  });

  it("defaults array fields and allows nulls for missing facts", () => {
    const parsed = briefResultSchema.parse({
      jobType: null,
      plaintiff: { name: null, address: null },
      defendant: { name: null, address: null },
      competentCourt: null,
      claimValue: null,
      factualDescription: null,
      reliefSought: null,
      confidence: 0.1,
    });
    expect(parsed.legalBasis).toEqual([]);
    expect(parsed.evidence).toEqual([]);
    expect(parsed.missingFields).toEqual([]);
    expect(parsed.warnings).toEqual([]);
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
  it("resolves a structured brief from the provider", async () => {
    const provider = new FakeChatModelProvider(fullBrief);

    await expect(
      runBriefExtractionLlm(provider, "Poruka klijenta:\nTužba"),
    ).resolves.toEqual(fullBrief);
  });

  it("rejects when the provider returns an invalid shape", async () => {
    const provider = new FakeChatModelProvider({ jobType: "lawsuit" });

    await expect(
      runBriefExtractionLlm(provider, "Poruka klijenta:\nTužba"),
    ).rejects.toThrow();
  });
});
