import { Params } from "@angular/router";
import {
  ChatSessionListQuery,
  ChatSessionScope,
  ChatSessionStateFilter,
  ChatSessionSummary,
  DocumentAnalysisKind,
} from "@law/api-interfaces";

export type ConversationGroupMode = "date" | "matter";
export type ConversationTokenKind = "client" | "case" | "author" | "kind";

/** A typed search token shown as a removable chip; `key` is `kind:id`. */
export interface ConversationToken {
  key: string;
  kind: ConversationTokenKind;
  id: string;
}

export interface ConversationFilters {
  scope: ChatSessionScope;
  states: ChatSessionStateFilter[];
  archived: boolean;
  tokens: ConversationToken[];
  /** Free text that is not (yet) a token. */
  text: string;
}

export interface ConversationGroup {
  key: string;
  /** Translation key (Today, Yesterday, Unlinked) or null. */
  labelKey: string | null;
  /** Date header for the date mode. */
  date: Date | null;
  /** "Client · Case number" header for the matter mode. */
  title: string | null;
  sessions: ChatSessionSummary[];
}

export interface ConversationSections {
  pinned: ChatSessionSummary[];
  groups: ConversationGroup[];
}

export const DEFAULT_CONVERSATION_FILTERS: ConversationFilters = {
  scope: "mine",
  states: [],
  archived: false,
  tokens: [],
  text: "",
};

export const ANALYSIS_TOKEN_KINDS: DocumentAnalysisKind[] = [
  "CONTRACT_REVIEW",
  "CASE_TIMELINE",
];

const STATE_VALUES: ChatSessionStateFilter[] = ["pending", "draft", "analysis"];
const TOKEN_PARAMS: Record<ConversationTokenKind, string> = {
  client: "client",
  case: "case",
  author: "author",
  kind: "kind",
};
const UNLINKED_GROUP_KEY = "matter:none";

export function tokenKey(kind: ConversationTokenKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseTokenKey(key: string): ConversationToken | null {
  const separator = key.indexOf(":");
  if (separator < 1) return null;
  const kind = key.slice(0, separator) as ConversationTokenKind;
  const id = key.slice(separator + 1);
  if (!(kind in TOKEN_PARAMS) || !id) return null;
  return { key, kind, id };
}

export function hasActiveFilters(filters: ConversationFilters): boolean {
  return (
    filters.states.length > 0 ||
    filters.archived ||
    filters.tokens.length > 0 ||
    filters.text.trim().length > 0
  );
}

export function toListQuery(
  filters: ConversationFilters,
  group: ConversationGroupMode,
): ChatSessionListQuery {
  const idsOf = (kind: ConversationTokenKind) =>
    filters.tokens.filter((token) => token.kind === kind).map((t) => t.id);
  const query: ChatSessionListQuery = {
    scope: filters.scope,
    group,
    ...(filters.text.trim() ? { search: filters.text.trim() } : {}),
    ...(filters.archived ? { archived: true } : {}),
    ...(filters.states.length ? { states: filters.states } : {}),
  };
  const caseIds = idsOf("case");
  const clientIds = idsOf("client");
  const authorIds = idsOf("author");
  const analysisKinds = idsOf("kind") as DocumentAnalysisKind[];
  if (caseIds.length) query.caseIds = caseIds;
  if (clientIds.length) query.clientIds = clientIds;
  if (authorIds.length) query.authorIds = authorIds;
  if (analysisKinds.length) query.analysisKinds = analysisKinds;
  return query;
}

/** Query params for the URL; defaults map to `null` so a merge clears them. */
export function filtersToQueryParams(
  filters: ConversationFilters,
  group: ConversationGroupMode,
): Params {
  const params: Params = {
    scope: filters.scope === "team" ? "team" : null,
    state: filters.states.length ? filters.states.join(",") : null,
    archived: filters.archived ? "1" : null,
    q: filters.text.trim() || null,
    group: group === "matter" ? "matter" : null,
  };
  for (const [kind, param] of Object.entries(TOKEN_PARAMS)) {
    const ids = filters.tokens
      .filter((token) => token.kind === kind)
      .map((token) => token.id);
    params[param] = ids.length ? ids.join(",") : null;
  }
  return params;
}

export function filtersFromQueryParams(params: {
  get(name: string): string | null;
}): { filters: ConversationFilters; group: ConversationGroupMode | null } {
  const list = (name: string) =>
    (params.get(name) ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const tokens: ConversationToken[] = [];
  for (const [kind, param] of Object.entries(TOKEN_PARAMS) as [
    ConversationTokenKind,
    string,
  ][]) {
    for (const id of list(param)) {
      if (kind === "kind" && !ANALYSIS_TOKEN_KINDS.includes(id as never)) {
        continue;
      }
      tokens.push({ key: tokenKey(kind, id), kind, id });
    }
  }
  const group = params.get("group");
  return {
    filters: {
      scope: params.get("scope") === "team" ? "team" : "mine",
      states: list("state").filter((state): state is ChatSessionStateFilter =>
        STATE_VALUES.includes(state as ChatSessionStateFilter),
      ),
      archived: params.get("archived") === "1",
      tokens,
      text: params.get("q") ?? "",
    },
    group: group === "matter" || group === "date" ? group : null,
  };
}

/** Pinned conversations first, then date or matter groups in list order. */
export function groupConversations(
  sessions: ChatSessionSummary[],
  mode: ConversationGroupMode,
  now: Date = new Date(),
): ConversationSections {
  const pinned = sessions.filter((session) => session.pinnedAt);
  const rest = sessions.filter((session) => !session.pinnedAt);
  return {
    pinned,
    groups: mode === "matter" ? groupByMatter(rest) : groupByDate(rest, now),
  };
}

function groupByDate(
  sessions: ChatSessionSummary[],
  now: Date,
): ConversationGroup[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const groups = new Map<string, ConversationGroup>();
  for (const session of sessions) {
    const day = new Date(session.updatedAt);
    day.setHours(0, 0, 0, 0);
    const key = day.toISOString();
    const differenceInDays = Math.round(
      (today.getTime() - day.getTime()) / 86_400_000,
    );
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date: day,
        title: null,
        labelKey:
          differenceInDays === 0
            ? "assistant.today"
            : differenceInDays === 1
              ? "assistant.yesterday"
              : null,
        sessions: [],
      });
    }
    groups.get(key)?.sessions.push(session);
  }
  return [...groups.values()].sort(
    (first, second) =>
      (second.date?.getTime() ?? 0) - (first.date?.getTime() ?? 0),
  );
}

function groupByMatter(sessions: ChatSessionSummary[]): ConversationGroup[] {
  const groups = new Map<string, ConversationGroup>();
  for (const session of sessions) {
    const linked = session.case;
    const key = linked ? `matter:${linked.id}` : UNLINKED_GROUP_KEY;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        date: null,
        labelKey: linked ? null : "assistant.organizer.unlinked",
        title: linked
          ? [linked.clientDisplayName, linked.caseNumber]
              .filter(Boolean)
              .join(" · ")
          : null,
        sessions: [],
      });
    }
    groups.get(key)?.sessions.push(session);
  }
  const unlinked = groups.get(UNLINKED_GROUP_KEY);
  groups.delete(UNLINKED_GROUP_KEY);
  return [...groups.values(), ...(unlinked ? [unlinked] : [])];
}
