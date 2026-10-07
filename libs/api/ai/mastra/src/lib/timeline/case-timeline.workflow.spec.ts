import { FakeChatModelProvider } from "@law/llm";
import {
  createCaseTimelineWorkflow,
  runCaseTimelineWorkflow,
  type CaseTimelineInput,
} from "./case-timeline.workflow";

const budget = {
  windowChars: 12_000,
  maxCharsPerDocument: 24_000,
  summaryMaxChars: 20_000,
  concurrency: 1,
};

const presuda =
  "PRESUDA P 12/2026. Dana 15.03.2026. godine sud je odbio tužbeni zahtev tužioca Petra Petrovića.";
const ugovor =
  "Ugovor o delu zaključen je 10.01.2025. između Alfa d.o.o. i Petra Petrovića.";

function input(overrides: Partial<CaseTimelineInput> = {}): CaseTimelineInput {
  return {
    focus: null,
    documents: [
      {
        ref: "doc:presuda",
        title: "Presuda",
        status: "COMPLETED",
        text: presuda,
      },
      { ref: "doc:ugovor", title: "Ugovor", status: "COMPLETED", text: ugovor },
      { ref: "att:sken", title: "Sken", status: "FAILED" },
    ],
    skipped: [{ ref: "doc:21", title: "Prilog 21" }],
    budget,
    ...overrides,
  };
}

const summary = {
  summary: "Spor oko ugovora o delu; tužbeni zahtev je odbijen.",
  openQuestions: ["Datum dostavljanja presude nije poznat."],
  warnings: [],
};

describe("case-timeline workflow", () => {
  it("extracts per document, verifies quotes and dates, merges, and summarizes", async () => {
    const provider = new FakeChatModelProvider([
      {
        documentSummary: "Prvostepena presuda.",
        events: [
          {
            title: "Odbijen tužbeni zahtev",
            kind: "DECISION",
            date: "2026-03-15",
            dateText: "15.03.2026.",
            description: "Sud je odbio zahtev.",
            quote: "sud je odbio tužbeni zahtev",
          },
          {
            title: "Izmišljen događaj",
            kind: "HEARING",
            date: "2026-02-31",
            quote: "ročište je održano",
          },
        ],
      },
      {
        documentSummary: "Ugovor o delu.",
        events: [
          {
            title: "Zaključen ugovor",
            kind: "CONTRACT",
            date: "2025-01-10",
            quote: "Ugovor o delu zaključen je 10.01.2025.",
          },
        ],
      },
      summary,
    ]);
    const completeStructured = jest.spyOn(provider, "completeStructured");

    const outcome = await runCaseTimelineWorkflow(
      createCaseTimelineWorkflow({ provider }),
      input(),
    );

    expect(completeStructured).toHaveBeenCalledTimes(3);
    const { result } = outcome;
    expect(result.events.map((item) => [item.date, item.title])).toEqual([
      ["2025-01-10", "Zaključen ugovor"],
      ["2026-03-15", "Odbijen tužbeni zahtev"],
      [null, "Izmišljen događaj"],
    ]);
    expect(result.events[1]).toMatchObject({
      sourceRef: "doc:presuda",
      sourceTitle: "Presuda",
      quote: "sud je odbio tužbeni zahtev",
    });
    // Impossible date dropped; quote absent from the source dropped.
    expect(result.events[2]).toMatchObject({ date: null, quote: null });
    expect(result.sources.map((item) => [item.title, item.status])).toEqual([
      ["Presuda", "READ"],
      ["Ugovor", "READ"],
      ["Sken", "NO_TEXT"],
      ["Prilog 21", "SKIPPED"],
    ]);
    expect(result.summary).toBe(summary.summary);
    expect(result.openQuestions).toEqual(summary.openQuestions);
    expect(outcome.truncated).toBe(true);
    const summaryPrompt =
      completeStructured.mock.calls[2][0].messages[1].content;
    expect(summaryPrompt).toContain(
      "2026-03-15 [DECISION] Odbijen tužbeni zahtev",
    );
    expect(summaryPrompt).toContain("Prilog 21 (preskočen");
  });

  it("reports a failing document and continues with the others", async () => {
    const provider = new FakeChatModelProvider([
      { events: "not-a-list" },
      { documentSummary: "Ugovor.", events: [] },
      summary,
    ]);

    const outcome = await runCaseTimelineWorkflow(
      createCaseTimelineWorkflow({ provider }),
      input({ skipped: [] }),
    );

    expect(outcome.result.sources.map((item) => item.status)).toEqual([
      "FAILED",
      "READ",
      "NO_TEXT",
    ]);
    expect(outcome.truncated).toBe(false);
  });

  it("fails when no document could be processed", async () => {
    await expect(
      runCaseTimelineWorkflow(
        createCaseTimelineWorkflow({
          provider: new FakeChatModelProvider([{ events: 1 }, { events: 1 }]),
        }),
        input({ skipped: [] }),
      ),
    ).rejects.toThrow();
  });
});
