import { describeToolCall, toolResultCount } from "./tool-call-summary";

describe("tool call summary", () => {
  it("labels calls by their main argument", () => {
    expect(
      describeToolCall("search_legal_sources", { query: "  Zakon   o radu " }),
    ).toBe("Zakon o radu");
    expect(describeToolCall("get_case", { reference: "P-7/2026" })).toBe(
      "P-7/2026",
    );
    expect(describeToolCall("get_case", {})).toBeNull();
    expect(describeToolCall("unknown_tool", { query: "x" })).toBeNull();
    expect(
      describeToolCall("revise_draft", { instruction: "Skrati uvod." }),
    ).toBe("Skrati uvod.");
    expect(describeToolCall("draft_lawsuit", {})).toBeNull();
    expect(
      describeToolCall("create_deadline", {
        title: "Odgovor",
        dueDate: "2026-10-15",
      }),
    ).toBe("Odgovor · 2026-10-15");
    expect(describeToolCall("link_case", { caseReference: "2026-21" })).toBe(
      "2026-21",
    );
  });

  it("clips long labels", () => {
    const label = describeToolCall("search_legal_sources", {
      query: "a".repeat(300),
    });
    expect(label).toHaveLength(120);
    expect(label?.endsWith("…")).toBe(true);
  });

  it("counts results per tool", () => {
    expect(
      toolResultCount("search_legal_sources", { count: 3, sources: "…" }),
    ).toBe(3);
    expect(toolResultCount("get_case", { found: "one", case: {} })).toBe(1);
    expect(
      toolResultCount("get_case", { found: "many", candidates: [{}, {}] }),
    ).toBe(2);
    expect(toolResultCount("get_case", { found: "none", message: "x" })).toBe(
      0,
    );
    expect(toolResultCount("search_legal_sources", null)).toBeNull();
    expect(
      toolResultCount("list_conversation_drafts", { drafts: [{}, {}] }),
    ).toBe(2);
    expect(
      toolResultCount("draft_lawsuit", { status: "DRAFT_READY" }),
    ).toBeNull();
  });
});
