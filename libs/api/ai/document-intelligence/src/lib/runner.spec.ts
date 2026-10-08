import { FakeChatModelProvider, type ChatModelProvider } from "@law/llm";
import { classifyDocument, extractFacts } from "./runner";
import { buildJmbgForTest } from "./test-identifiers";

function spy(inner: ChatModelProvider) {
  const requests: { role: string; content: string }[][] = [];
  const provider: ChatModelProvider = {
    completeStructured: (request) => {
      requests.push(request.messages as { role: string; content: string }[]);
      return inner.completeStructured(request);
    },
    streamText: (request) => inner.streamText(request),
  };
  return { provider, requests };
}

describe("classifyDocument", () => {
  it("falls back to OTHER below the confidence threshold", async () => {
    const provider = new FakeChatModelProvider({
      kind: "ID_CARD",
      confidence: 0.4,
    });
    await expect(classifyDocument(provider, "tekst", 0.6)).resolves.toEqual({
      kind: "OTHER",
      confidence: 0.4,
    });
  });

  it("keeps the kind at or above the threshold", async () => {
    const provider = new FakeChatModelProvider({
      kind: "ID_CARD",
      confidence: 0.9,
    });
    await expect(classifyDocument(provider, "tekst", 0.6)).resolves.toEqual({
      kind: "ID_CARD",
      confidence: 0.9,
    });
  });

  it("maps an unknown kind to OTHER", async () => {
    const provider = new FakeChatModelProvider({
      kind: "MENU",
      confidence: 0.99,
    });
    const result = await classifyDocument(provider, "tekst", 0.6);
    expect(result.kind).toBe("OTHER");
  });

  it("sends at most the first 4000 characters of the document", async () => {
    const { provider, requests } = spy(
      new FakeChatModelProvider({ kind: "OTHER", confidence: 0.9 }),
    );
    await classifyDocument(provider, "a".repeat(10_000), 0.6);
    const user = requests[0].find((m) => m.role === "user");
    expect(user?.content.length).toBeLessThanOrEqual(4000);
    expect(user?.content).toBe("a".repeat(4000));
  });
});

describe("extractFacts", () => {
  const jmbg = buildJmbgForTest("0101990");
  const text = `Ime: Petar Petrović\nJMBG: ${jmbg}`;

  it("keeps verified facts and drops fabricated quotes", async () => {
    const provider = new FakeChatModelProvider({
      subjects: [
        {
          subjectKey: "holder",
          subjectType: "PERSON",
          subjectRole: null,
          facts: [
            {
              field: "fullName",
              value: "Petar Petrović",
              quote: "Ime: Petar Petrović",
              confidence: 0.95,
            },
            {
              field: "placeOfBirth",
              value: "Niš",
              quote: "Mesto rođenja: Niš",
              confidence: 0.9,
            },
          ],
        },
      ],
    });
    const facts = await extractFacts(provider, "ID_CARD", text);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      subjectKey: "holder",
      subjectType: "PERSON",
      field: "fullName",
      charStart: 0,
    });
  });

  it("lists the allowed fields in the system prompt", async () => {
    const { provider, requests } = spy(
      new FakeChatModelProvider({ subjects: [] }),
    );
    await expect(
      extractFacts(provider, "COURT_DECISION", text),
    ).resolves.toEqual([]);
    const system = requests[0].find((m) => m.role === "system")?.content ?? "";
    expect(system).toContain("servedDate");
    expect(system).toContain("legalRemedyInstruction");
  });
});
