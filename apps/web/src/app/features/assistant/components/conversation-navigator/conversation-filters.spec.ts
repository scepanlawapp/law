import { convertToParamMap } from "@angular/router";
import { ChatSessionSummary } from "@law/api-interfaces";
import {
  ConversationFilters,
  DEFAULT_CONVERSATION_FILTERS,
  filtersFromQueryParams,
  filtersToQueryParams,
  groupConversations,
  hasActiveFilters,
  parseTokenKey,
  toListQuery,
  tokenKey,
} from "./conversation-filters";

const now = new Date("2026-10-07T12:00:00");

function session(
  id: string,
  updatedAt: string,
  overrides: Partial<ChatSessionSummary> = {},
): ChatSessionSummary {
  return {
    id,
    workspaceId: "workspace-1",
    createdByUserId: "user-1",
    title: id,
    status: "ACTIVE",
    isDeleted: false,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

const petrovicCase = {
  id: "case-1",
  caseNumber: "P-2026-001",
  name: "Naknada štete",
  clientId: "client-1",
  clientDisplayName: "Petrović d.o.o.",
};

describe("conversation filters", () => {
  const filters: ConversationFilters = {
    scope: "team",
    states: ["pending", "draft"],
    archived: true,
    tokens: [
      { key: tokenKey("client", "client-1"), kind: "client", id: "client-1" },
      { key: tokenKey("case", "case-1"), kind: "case", id: "case-1" },
      { key: tokenKey("author", "user-2"), kind: "author", id: "user-2" },
      {
        key: tokenKey("kind", "CONTRACT_REVIEW"),
        kind: "kind",
        id: "CONTRACT_REVIEW",
      },
    ],
    text: "  zakup ",
  };

  it("builds the list query from chips, tokens and text", () => {
    expect(toListQuery(filters, "matter")).toEqual({
      scope: "team",
      group: "matter",
      search: "zakup",
      archived: true,
      states: ["pending", "draft"],
      caseIds: ["case-1"],
      clientIds: ["client-1"],
      authorIds: ["user-2"],
      analysisKinds: ["CONTRACT_REVIEW"],
    });
    expect(toListQuery(DEFAULT_CONVERSATION_FILTERS, "date")).toEqual({
      scope: "mine",
      group: "date",
    });
  });

  it("round-trips filters through URL query params", () => {
    const params = filtersToQueryParams(filters, "matter");
    expect(params).toEqual({
      scope: "team",
      state: "pending,draft",
      archived: "1",
      q: "zakup",
      group: "matter",
      client: "client-1",
      case: "case-1",
      author: "user-2",
      kind: "CONTRACT_REVIEW",
    });
    const restored = filtersFromQueryParams(convertToParamMap(params));
    expect(restored).toEqual({
      filters: { ...filters, text: "zakup" },
      group: "matter",
    });
  });

  it("clears default values from the URL and ignores unknown values", () => {
    expect(filtersToQueryParams(DEFAULT_CONVERSATION_FILTERS, "date")).toEqual({
      scope: null,
      state: null,
      archived: null,
      q: null,
      group: null,
      client: null,
      case: null,
      author: null,
      kind: null,
    });
    expect(
      filtersFromQueryParams(
        convertToParamMap({ state: "pending,bogus", kind: "NOPE", group: "x" }),
      ),
    ).toEqual({
      filters: { ...DEFAULT_CONVERSATION_FILTERS, states: ["pending"] },
      group: null,
    });
  });

  it("parses token keys and reports active filters", () => {
    expect(parseTokenKey("case:case-1")).toEqual({
      key: "case:case-1",
      kind: "case",
      id: "case-1",
    });
    expect(parseTokenKey("unknown:1")).toBeNull();
    expect(parseTokenKey("case:")).toBeNull();
    expect(hasActiveFilters(DEFAULT_CONVERSATION_FILTERS)).toBe(false);
    expect(
      hasActiveFilters({ ...DEFAULT_CONVERSATION_FILTERS, scope: "team" }),
    ).toBe(false);
    expect(hasActiveFilters(filters)).toBe(true);
  });
});

describe("groupConversations", () => {
  const sessions = [
    session("pinned", "2026-09-01T10:00:00", {
      pinnedAt: "2026-10-01T10:00:00.000Z",
      case: petrovicCase,
    }),
    session("today", "2026-10-07T09:00:00", { case: petrovicCase }),
    session("yesterday", "2026-10-06T09:00:00"),
    session("older", "2026-10-01T09:00:00", {
      case: { ...petrovicCase, id: "case-2", caseNumber: "P-2026-002" },
    }),
    session("today-2", "2026-10-07T08:00:00"),
  ];

  it("puts pinned conversations in their own section", () => {
    const { pinned, groups } = groupConversations(sessions, "date", now);
    expect(pinned.map((item) => item.id)).toEqual(["pinned"]);
    expect(
      groups.flatMap((group) => group.sessions).map((s) => s.id),
    ).not.toContain("pinned");
  });

  it("groups by day with Today and Yesterday labels", () => {
    const { groups } = groupConversations(sessions, "date", now);
    expect(
      groups.map((group) => [
        group.labelKey,
        group.sessions.map((item) => item.id),
      ]),
    ).toEqual([
      ["assistant.today", ["today", "today-2"]],
      ["assistant.yesterday", ["yesterday"]],
      [null, ["older"]],
    ]);
  });

  it("groups by matter with unlinked conversations last", () => {
    const { groups } = groupConversations(sessions, "matter", now);
    expect(
      groups.map((group) => [
        group.title ?? group.labelKey,
        group.sessions.map((item) => item.id),
      ]),
    ).toEqual([
      ["Petrović d.o.o. · P-2026-001", ["today"]],
      ["Petrović d.o.o. · P-2026-002", ["older"]],
      ["assistant.organizer.unlinked", ["yesterday", "today-2"]],
    ]);
  });
});
