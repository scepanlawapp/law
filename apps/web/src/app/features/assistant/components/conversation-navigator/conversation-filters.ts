import { Params } from "@angular/router";
import {
  ChatSessionListQuery,
  ChatSessionScope,
  ChatSessionStateFilter,
  ChatSessionSummary,
  DocumentAnalysisKind,
} from "@law/api-interfaces";
import {
  CHAT_SESSION_STATE_FILTER_LABELS,
  ConversationTokenKind,
  DOCUMENT_ANALYSIS_KIND_LABELS,
} from "../../../../shared/models";

export const ConversationGroupMode = {
  DATE: "date",
  MATTER: "matter",
} as const;
export type ConversationGroupMode =
  (typeof ConversationGroupMode)[keyof typeof ConversationGroupMode];

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
  scope: ChatSessionScope.MINE,
  states: [],
  archived: false,
  tokens: [],
  text: "",
};

export const ANALYSIS_TOKEN_KINDS = Object.keys(
  DOCUMENT_ANALYSIS_KIND_LABELS,
) as DocumentAnalysisKind[];

const STATE_VALUES = Object.keys(
  CHAT_SESSION_STATE_FILTER_LABELS,
) as ChatSessionStateFilter[];
/** Each token kind is also the URL param that carries its ids. */
const TOKEN_KINDS = Object.values(ConversationTokenKind);
const UNLINKED_GROUP_KEY = "matter:none";
const ARCHIVED_PARAM_VALUE = "1";

export function tokenKey(kind: ConversationTokenKind, id: string): string {
  return `${kind}:${id}`;
}

export function parseTokenKey(key: string): ConversationToken | null {
  const separator = key.indexOf(":");
  if (separator < 1) return null;
  const kind = key.slice(0, separator) as ConversationTokenKind;
  const id = key.slice(separator + 1);
  if (!TOKEN_KINDS.includes(kind) || !id) return null;
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
  const caseIds = idsOf(ConversationTokenKind.CASE);
  const clientIds = idsOf(ConversationTokenKind.CLIENT);
  const authorIds = idsOf(ConversationTokenKind.AUTHOR);
  const analysisKinds = idsOf(
    ConversationTokenKind.KIND,
  ) as DocumentAnalysisKind[];
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
    scope:
      filters.scope === ChatSessionScope.TEAM ? ChatSessionScope.TEAM : null,
    state: filters.states.length ? filters.states.join(",") : null,
    archived: filters.archived ? ARCHIVED_PARAM_VALUE : null,
    q: filters.text.trim() || null,
    group:
      group === ConversationGroupMode.MATTER
        ? ConversationGroupMode.MATTER
        : null,
  };
  for (const kind of TOKEN_KINDS) {
    const ids = filters.tokens
      .filter((token) => token.kind === kind)
      .map((token) => token.id);
    params[kind] = ids.length ? ids.join(",") : null;
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
  for (const kind of TOKEN_KINDS) {
    for (const id of list(kind)) {
      if (
        kind === ConversationTokenKind.KIND &&
        !ANALYSIS_TOKEN_KINDS.includes(id as DocumentAnalysisKind)
      ) {
        continue;
      }
      tokens.push({ key: tokenKey(kind, id), kind, id });
    }
  }
  const group = params.get("group");
  return {
    filters: {
      scope:
        params.get("scope") === ChatSessionScope.TEAM
          ? ChatSessionScope.TEAM
          : ChatSessionScope.MINE,
      states: list("state").filter((state): state is ChatSessionStateFilter =>
        STATE_VALUES.includes(state as ChatSessionStateFilter),
      ),
      archived: params.get("archived") === ARCHIVED_PARAM_VALUE,
      tokens,
      text: params.get("q") ?? "",
    },
    group: isConversationGroupMode(group) ? group : null,
  };
}

export function isConversationGroupMode(
  value: string | null,
): value is ConversationGroupMode {
  return (Object.values(ConversationGroupMode) as (string | null)[]).includes(
    value,
  );
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
    groups:
      mode === ConversationGroupMode.MATTER
        ? groupByMatter(rest)
        : groupByDate(rest, now),
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
