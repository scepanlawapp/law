import { HttpException, Injectable, Optional } from "@nestjs/common";
import type {
  CalendarItem,
  CaseReference,
  CaseSummary,
  CaseDetail,
  ClientSummary,
  DeadlineDetail,
  EventDetail,
  TaskDetail,
} from "@law/api-interfaces";
import {
  ActivitiesTasksDeadlinesService,
  ActivityListQueryDto,
  CalendarQueryDto,
  DeadlineListQueryDto,
  EventListQueryDto,
  TaskListQueryDto,
} from "@law/activities-tasks-deadlines";
import { CaseListQueryDto, CasesService } from "@law/cases";
import {
  ClientActivityListQueryDto,
  ClientCaseListQueryDto,
  ClientListQueryDto,
  ClientsService,
} from "@law/clients";
import { PlatformPrismaService, WorkspaceContextService } from "@law/core";
import type {
  ActivityQuery,
  AssistantActivityEntry,
  AssistantCaseFacts,
  AssistantClientFacts,
  AssistantClientLookup,
  AssistantListResult,
  AssistantTurnScope,
  AssistantWorkItem,
  WorkItemQuery,
} from "@law/mastra";
import { toLatin } from "@law/transliteration";
import { belgradeToday } from "./assistant-actions.service";

const LIST_LIMIT = 10;
const WORK_LIMIT = 20;
const AGENDA_LIMIT = 50;
const AGENDA_MAX_DAYS = 31;
const CANDIDATE_LIMIT = 5;
const TEXT_MAX_CHARS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

const OPEN_CASE_STATUSES = ["DRAFT", "ACTIVE", "ON_HOLD"];
const OPEN_TASK = ["TODO", "IN_PROGRESS"] as const;
const OPEN_DEADLINE = ["OPEN"] as const;
const OPEN_EVENT = ["SCHEDULED"] as const;
const WORK_STATUSES = {
  open: { task: OPEN_TASK, deadline: OPEN_DEADLINE, event: OPEN_EVENT },
  done: {
    task: ["DONE"] as const,
    deadline: ["SATISFIED"] as const,
    event: ["COMPLETED"] as const,
  },
  all: { task: undefined, deadline: undefined, event: undefined },
};
const AGENDA_STATUSES = [
  "SCHEDULED",
  "COMPLETED",
  "TODO",
  "IN_PROGRESS",
  "DONE",
  "OPEN",
  "SATISFIED",
];
const OPEN_ITEM_STATUSES = new Set<string>([...OPEN_TASK, ...OPEN_DEADLINE]);

const ME = new Set([
  "me",
  "my",
  "myself",
  "ja",
  "mene",
  "meni",
  "moj",
  "moji",
  "moje",
  "moja",
]);
const OFFICE = new Set([
  "office",
  "all",
  "everyone",
  "kancelarija",
  "svi",
  "sve",
  "cela kancelarija",
]);

const BELGRADE_DATE_TIME = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Belgrade",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type Failure = Exclude<AssistantListResult<never>, { status: "OK" }>;
type Resolved<T> = { value: T; label: string | null } | { failure: Failure };

interface Member {
  userId: string;
  name: string;
  tokens: string[];
}

/**
 * Read-only office data for the assistant's tools: clients, cases, work items,
 * agenda, and activity. Resolves "me", colleague names, and case/client
 * references, caps lists, clips free text, and never returns personal
 * identifiers. Services scope by the job's workspace context.
 */
@Injectable()
export class AssistantOfficeReadsService {
  constructor(
    private readonly prisma: PlatformPrismaService,
    @Optional() private readonly cases?: CasesService,
    @Optional() private readonly clients?: ClientsService,
    @Optional() private readonly work?: ActivitiesTasksDeadlinesService,
  ) {}

  searchCases(
    scope: AssistantTurnScope,
    args: {
      query?: string;
      status?: string;
      priority?: string;
      client?: string;
      responsible?: string;
    },
  ): Promise<AssistantListResult<AssistantCaseFacts>> {
    return this.guard(scope, async () => {
      const filters: Record<string, string> = {};
      const client = await this.optionalClient(args.client);
      if ("failure" in client) return client.failure;
      const person = await this.optionalPerson(scope, args.responsible);
      if ("failure" in person) return person.failure;
      if (args.query) filters["tekst"] = args.query;
      if (args.status) filters["status"] = args.status;
      if (args.priority) filters["prioritet"] = args.priority;
      if (client.label) filters["klijent"] = client.label;
      if (person.label) filters["odgovorni"] = person.label;
      const { items, meta } = await this.cases!.list(
        Object.assign(new CaseListQueryDto(), {
          search: args.query,
          status: args.status,
          priority: args.priority,
          clientId: client.value ?? undefined,
          responsibleUserId: person.value ?? undefined,
          page: 1,
          pageSize: LIST_LIMIT,
        }),
      );
      return ok(filters, items.map(caseFacts), meta.totalItems);
    });
  }

  searchClients(
    scope: AssistantTurnScope,
    args: { query?: string; status?: string; responsible?: string },
  ): Promise<AssistantListResult<AssistantClientFacts>> {
    return this.guard(scope, async () => {
      const person = await this.optionalPerson(scope, args.responsible);
      if ("failure" in person) return person.failure;
      const filters: Record<string, string> = {};
      if (args.query) filters["tekst"] = args.query;
      if (args.status) filters["status"] = args.status;
      if (person.label) filters["odgovorni"] = person.label;
      const { items, meta } = await this.clients!.list(
        Object.assign(new ClientListQueryDto(), {
          search: args.query,
          status: args.status,
          responsibleUserId: person.value ?? undefined,
          page: 1,
          pageSize: LIST_LIMIT,
        }),
      );
      return ok(filters, items.map(clientFacts), meta.totalItems);
    });
  }

  async getClient(
    scope: AssistantTurnScope,
    args: { reference: string },
  ): Promise<AssistantClientLookup> {
    const result = await this.guard(scope, async () => {
      const { items } = await this.clients!.list(
        Object.assign(new ClientListQueryDto(), {
          search: args.reference,
          page: 1,
          pageSize: CANDIDATE_LIMIT,
        }),
      );
      const match = pickClient(items, args.reference);
      if (!match) {
        return items.length
          ? ({ found: "many", candidates: items.map(clientFacts) } as const)
          : ({
              found: "none",
              message: `Nema klijenta za "${args.reference}".`,
            } as const);
      }
      const [detail, contacts, cases] = await Promise.all([
        this.clients!.get(match.id),
        this.clients!.listContacts(match.id),
        this.clients!.listCases(
          match.id,
          Object.assign(new ClientCaseListQueryDto(), {
            page: 1,
            pageSize: 50,
          }),
        ),
      ]);
      return {
        found: "one",
        client: {
          ...clientFacts(detail),
          taxNumber: detail.taxNumber,
          registrationNumber: detail.registrationNumber,
          notes: clipText(detail.notes),
          contacts: contacts
            .filter((contact) => contact.status === "ACTIVE")
            .slice(0, LIST_LIMIT)
            .map((contact) => ({
              name: toLatin(`${contact.firstName} ${contact.lastName}`),
              position: contact.position ? toLatin(contact.position) : null,
              email: contact.email,
              phone: contact.phone,
              isPrimary: contact.isPrimary,
            })),
          openCases: cases.items
            .filter((item) => OPEN_CASE_STATUSES.includes(item.status))
            .slice(0, LIST_LIMIT)
            .map((item) => ({
              caseNumber: item.caseNumber,
              name: toLatin(item.name),
              status: item.status,
              priority: item.priority,
            })),
        },
      } as const;
    });
    return "status" in result
      ? { found: "none", message: result.message }
      : result;
  }

  listWorkItems(
    scope: AssistantTurnScope,
    args: WorkItemQuery,
  ): Promise<AssistantListResult<AssistantWorkItem>> {
    return this.guard(scope, async () => {
      const useDefault = !args.case && !args.client && !args.person;
      const target = await this.caseOrClient(
        args.case,
        args.client,
        useDefault ? args.linkedCaseId : null,
      );
      if ("failure" in target) return target.failure;
      const person =
        useDefault && !args.linkedCaseId
          ? await this.resolvePerson(scope, "me")
          : await this.optionalPerson(scope, args.person);
      if ("failure" in person) return person.failure;

      const today = belgradeToday();
      const state = args.overdueOnly ? "open" : args.state;
      const to = args.overdueOnly
        ? minDay(args.to ? addDays(args.to, 1) : today, today)
        : args.to
          ? addDays(args.to, 1)
          : undefined;
      const range = {
        from: args.from ? belgradeStart(args.from).toISOString() : undefined,
        to: to ? belgradeStart(to).toISOString() : undefined,
      };
      const statuses = WORK_STATUSES[state];
      const want = (kind: "task" | "deadline" | "event") =>
        args.kind === "all" || args.kind === kind;
      const base = {
        ...range,
        caseId: target.value.caseId,
        clientId: target.value.clientId,
        page: 1,
        pageSize: WORK_LIMIT,
      };
      const userId = person.value ?? undefined;
      const [tasks, deadlines, events] = await Promise.all([
        want("task")
          ? this.work!.listTasks(
              Object.assign(new TaskListQueryDto(), {
                ...base,
                statuses: statuses.task && [...statuses.task],
                assigneeUserId: userId,
              }),
            )
          : null,
        want("deadline")
          ? this.work!.listDeadlines(
              Object.assign(new DeadlineListQueryDto(), {
                ...base,
                statuses: statuses.deadline && [...statuses.deadline],
                responsibleUserId: userId,
              }),
            )
          : null,
        want("event") && !args.overdueOnly
          ? this.work!.listEvents(
              Object.assign(new EventListQueryDto(), {
                ...base,
                statuses: statuses.event && [...statuses.event],
                userId,
              }),
            )
          : null,
      ]);
      const items = [
        ...(tasks?.items.map((item) => taskItem(item, today)) ?? []),
        ...(deadlines?.items.map(deadlineItem) ?? []),
        ...(events?.items.map(eventItem) ?? []),
      ].sort(byDue);
      const total =
        (tasks?.meta.totalItems ?? 0) +
        (deadlines?.meta.totalItems ?? 0) +
        (events?.meta.totalItems ?? 0);

      const filters: Record<string, string> = {
        vrsta: args.kind,
        stanje: state,
      };
      if (target.label) filters["obuhvat"] = target.label;
      if (person.label) filters["osoba"] = person.label;
      if (args.from) filters["od"] = args.from;
      if (args.to) filters["do"] = args.to;
      if (args.overdueOnly) filters["samoZakasneli"] = "da";
      return ok(filters, items.slice(0, WORK_LIMIT), total);
    });
  }

  getAgenda(
    scope: AssistantTurnScope,
    args: { from: string; to: string; person?: string },
  ): Promise<AssistantListResult<AssistantWorkItem>> {
    return this.guard(scope, async () => {
      const days =
        (Date.parse(`${args.to}T00:00:00Z`) -
          Date.parse(`${args.from}T00:00:00Z`)) /
          DAY_MS +
        1;
      if (!(days >= 1 && days <= AGENDA_MAX_DAYS)) {
        return {
          status: "INVALID",
          message: `Raspon mora biti od 1 do ${AGENDA_MAX_DAYS} dana, a "od" pre "do".`,
        };
      }
      const person = await this.resolvePerson(scope, args.person ?? "me");
      if ("failure" in person) return person.failure;
      const today = belgradeToday();
      const { items, nextCursor } = await this.work!.calendar(
        Object.assign(new CalendarQueryDto(), {
          from: belgradeStart(args.from).toISOString(),
          to: belgradeStart(addDays(args.to, 1)).toISOString(),
          userIds: person.value ? [person.value] : undefined,
          statuses: AGENDA_STATUSES,
          limit: AGENDA_LIMIT,
        }),
      );
      return {
        status: "OK",
        filters: {
          od: args.from,
          do: args.to,
          osoba: person.label ?? "cela kancelarija",
        },
        items: items.map((item) => calendarItem(item, today)),
        total: items.length,
        truncated: nextCursor !== null,
      };
    });
  }

  listActivity(
    scope: AssistantTurnScope,
    args: ActivityQuery,
  ): Promise<AssistantListResult<AssistantActivityEntry>> {
    return this.guard(scope, async () => {
      const target = await this.caseOrClient(
        args.case,
        args.client,
        args.linkedCaseId,
      );
      if ("failure" in target) return target.failure;
      const { caseId, clientId } = target.value;
      if (!caseId && !clientId) {
        return {
          status: "INVALID",
          message:
            "Razgovor nije povezan sa predmetom. Navedite predmet ili klijenta.",
        };
      }
      const limit = args.limit;
      const where = caseId ? { caseId } : { clientId };
      const [journal, log, members] = await Promise.all([
        caseId
          ? this.cases!.listActivities(caseId, {
              page: 1,
              pageSize: limit,
            }).then((page) => page.items)
          : this.clients!.listActivities(
              clientId!,
              Object.assign(new ClientActivityListQueryDto(), {
                includeCaseActivities: true,
                page: 1,
                pageSize: limit,
              }),
            ).then((page) => page.items),
        this.work!.listActivity(
          Object.assign(new ActivityListQueryDto(), {
            ...where,
            page: 1,
            pageSize: limit * 2,
          }),
        ).then((page) => page.items),
        this.members(scope.workspaceId),
      ]);
      const names = new Map(
        members.map((member) => [member.userId, member.name]),
      );
      const titles = await this.entityTitles(scope.workspaceId, log);

      const entries: Array<AssistantActivityEntry & { at: number }> = [
        ...journal.slice(0, limit).map((item) => ({
          at: item.activityDate.getTime(),
          date: belgradeDateTime(item.activityDate),
          kind: "JOURNAL" as const,
          type: item.type,
          title: toLatin(item.title),
          text: clipText(item.description),
          author: names.get(item.createdByUserId) ?? null,
        })),
        ...log.map((row) => ({
          at: Date.parse(row.occurredAt),
          date: belgradeDateTime(row.occurredAt),
          kind: "LOG" as const,
          type: row.action,
          title: titles.get(row.entityId) ?? null,
          text: null,
          author: row.actorUserId ? (names.get(row.actorUserId) ?? null) : null,
        })),
      ].sort((left, right) => right.at - left.at);

      const filters: Record<string, string> = {};
      if (target.label) filters["obuhvat"] = target.label;
      return ok(
        filters,
        entries.slice(0, limit).map(({ at: _at, ...entry }) => entry),
        entries.length,
      );
    });
  }

  /** Responsible lawyers and open work counts for a single-case lookup. */
  async caseExtras(
    workspaceId: string,
    caseId: string,
  ): Promise<
    Pick<
      AssistantCaseFacts,
      "responsibleLawyers" | "openTaskCount" | "openDeadlineCount"
    >
  > {
    if (!this.cases || !this.work) return {};
    const [responsibilities, members, tasks, deadlines] = await Promise.all([
      this.cases
        .listResponsibilities(caseId, { page: 1, pageSize: 100 })
        .then((page) => page.items),
      this.members(workspaceId),
      this.work.listTasks(
        Object.assign(new TaskListQueryDto(), {
          caseId,
          statuses: [...OPEN_TASK],
          page: 1,
          pageSize: 1,
        }),
      ),
      this.work.listDeadlines(
        Object.assign(new DeadlineListQueryDto(), {
          caseId,
          statuses: [...OPEN_DEADLINE],
          page: 1,
          pageSize: 1,
        }),
      ),
    ]);
    const names = new Map(
      members.map((member) => [member.userId, member.name]),
    );
    return {
      responsibleLawyers: responsibilities
        .filter((item) => !item.endedAt)
        .map((item) => names.get(item.userId))
        .filter((name): name is string => !!name),
      openTaskCount: tasks.meta.totalItems,
      openDeadlineCount: deadlines.meta.totalItems,
    };
  }

  /** Runs a read in the tool's workspace; client errors become NOT_FOUND. */
  private async guard<T>(
    scope: AssistantTurnScope,
    fn: () => Promise<T | Failure>,
  ): Promise<T | Failure> {
    if (
      !this.cases ||
      !this.clients ||
      !this.work ||
      WorkspaceContextService.current?.workspaceId !== scope.workspaceId
    ) {
      return {
        status: "UNAVAILABLE",
        message: "Podaci kancelarije trenutno nisu dostupni.",
      };
    }
    try {
      return await fn();
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return { status: "NOT_FOUND", message: "Zapis nije pronađen." };
      }
      throw error;
    }
  }

  private optionalPerson(
    scope: AssistantTurnScope,
    reference?: string,
  ): Promise<Resolved<string | null>> {
    return reference
      ? this.resolvePerson(scope, reference)
      : Promise.resolve({ value: null, label: null });
  }

  /** "me" → the conversation's owner, "office" → everyone, else a colleague. */
  private async resolvePerson(
    scope: AssistantTurnScope,
    reference: string,
  ): Promise<Resolved<string | null>> {
    const text = normalize(reference);
    if (OFFICE.has(text)) {
      return { value: null, label: "cela kancelarija" };
    }
    if (ME.has(text)) {
      return scope.userId
        ? { value: scope.userId, label: scope.userDisplayName }
        : {
            failure: {
              status: "UNAVAILABLE",
              message: "Trenutni korisnik nije poznat. Navedite ime osobe.",
            },
          };
    }
    const members = await this.members(scope.workspaceId);
    const wanted = tokens(text);
    const byPrefix = (length: (token: string) => number) =>
      members.filter((member) =>
        wanted.every((want) =>
          member.tokens.some((token) =>
            token.startsWith(want.slice(0, length(want))),
          ),
        ),
      );
    let matches = byPrefix((want) => want.length);
    // Serbian case endings ("Marka", "Markom"): retry with a short stem.
    if (!matches.length) {
      matches = byPrefix((want) => Math.max(3, want.length - 2));
    }
    if (matches.length === 1) {
      return { value: matches[0].userId, label: matches[0].name };
    }
    return {
      failure: matches.length
        ? {
            status: "AMBIGUOUS",
            message: `Više osoba odgovara imenu "${reference}".`,
            candidates: matches.slice(0, CANDIDATE_LIMIT).map((m) => m.name),
          }
        : {
            status: "NOT_FOUND",
            message: `Nema aktivnog člana kancelarije "${reference}".`,
          },
    };
  }

  private async optionalClient(
    reference?: string,
  ): Promise<Resolved<string | null>> {
    if (!reference) return { value: null, label: null };
    const { items } = await this.clients!.list(
      Object.assign(new ClientListQueryDto(), {
        search: reference,
        page: 1,
        pageSize: CANDIDATE_LIMIT,
      }),
    );
    const match = pickClient(items, reference);
    if (match) {
      return { value: match.id, label: toLatin(match.displayName) };
    }
    return {
      failure: items.length
        ? {
            status: "AMBIGUOUS",
            message: `Više klijenata odgovara "${reference}".`,
            candidates: items.map(
              (item) => `${item.clientNumber} · ${toLatin(item.displayName)}`,
            ),
          }
        : { status: "NOT_FOUND", message: `Nema klijenta za "${reference}".` },
    };
  }

  private async optionalCase(
    reference?: string,
  ): Promise<Resolved<string | null>> {
    if (!reference) return { value: null, label: null };
    const { items } = await this.cases!.list(
      Object.assign(new CaseListQueryDto(), {
        search: reference,
        page: 1,
        pageSize: CANDIDATE_LIMIT,
      }),
    );
    const match =
      items.find(
        (item) => item.caseNumber.toLowerCase() === reference.toLowerCase(),
      ) ?? (items.length === 1 ? items[0] : undefined);
    if (match) return { value: match.id, label: caseLabel(match) };
    return {
      failure: items.length
        ? {
            status: "AMBIGUOUS",
            message: `Više predmeta odgovara "${reference}".`,
            candidates: items.map(caseLabel),
          }
        : { status: "NOT_FOUND", message: `Nema predmeta za "${reference}".` },
    };
  }

  /** A named case or client; otherwise the fallback (linked) case, if any. */
  private async caseOrClient(
    caseReference: string | undefined,
    clientReference: string | undefined,
    fallbackCaseId: string | null,
  ): Promise<
    Resolved<{ caseId: string | undefined; clientId: string | undefined }>
  > {
    const [named, client] = await Promise.all([
      this.optionalCase(caseReference),
      this.optionalClient(clientReference),
    ]);
    if ("failure" in named) return named;
    if ("failure" in client) return client;
    if (named.value || client.value) {
      return {
        value: {
          caseId: named.value ?? undefined,
          clientId: client.value ?? undefined,
        },
        label: [named.label, client.label].filter(Boolean).join(" · "),
      };
    }
    if (!fallbackCaseId) {
      return {
        value: { caseId: undefined, clientId: undefined },
        label: null,
      };
    }
    const linked = await this.cases!.get(fallbackCaseId);
    return {
      value: { caseId: linked.id, clientId: undefined },
      label: `povezani predmet ${caseLabel(linked)}`,
    };
  }

  private async members(workspaceId: string): Promise<Member[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId, status: "ACTIVE" },
      select: {
        userId: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });
    return rows.map(({ userId, user }) => {
      const name = toLatin(
        [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
      );
      return {
        userId,
        name,
        tokens: tokens(normalize(`${name} ${user.email.split("@")[0]}`)),
      };
    });
  }

  private async entityTitles(
    workspaceId: string,
    rows: Array<{ entityType: string; entityId: string }>,
  ): Promise<Map<string, string>> {
    const ids = (type: string) =>
      rows.filter((row) => row.entityType === type).map((row) => row.entityId);
    const select = { id: true, title: true } as const;
    const [tasks, deadlines, events] = await Promise.all([
      this.prisma.task.findMany({
        where: { workspaceId, id: { in: ids("Task") } },
        select,
      }),
      this.prisma.deadline.findMany({
        where: { workspaceId, id: { in: ids("Deadline") } },
        select,
      }),
      this.prisma.event.findMany({
        where: { workspaceId, id: { in: ids("Event") } },
        select,
      }),
    ]);
    return new Map(
      [...tasks, ...deadlines, ...events].map((row) => [
        row.id,
        toLatin(row.title),
      ]),
    );
  }
}

export function caseFacts(item: CaseSummary | CaseDetail): AssistantCaseFacts {
  const detail = "description" in item ? item : null;
  return {
    caseNumber: item.caseNumber,
    name: toLatin(item.name),
    status: item.status,
    priority: item.priority,
    client: toLatin(item.client.displayName),
    responsible: toLatin(item.responsibleUser.displayName),
    opposingParty: detail?.opposingPartyName
      ? toLatin(detail.opposingPartyName)
      : null,
    description: detail?.description?.trim()
      ? toLatin(detail.description.trim())
      : null,
    openedDate: item.openedDate,
    closedDate: item.closedDate,
  };
}

function clientFacts(item: ClientSummary): AssistantClientFacts {
  return {
    clientNumber: item.clientNumber,
    name: toLatin(item.displayName),
    type: item.type,
    status: item.status,
    responsible: item.responsibleUser
      ? toLatin(item.responsibleUser.displayName)
      : null,
    email: item.email,
    phone: item.phone,
    activeCaseCount: item.activeCaseCount,
  };
}

function pickClient(
  items: ClientSummary[],
  reference: string,
): ClientSummary | undefined {
  const wanted = normalize(reference);
  return (
    items.find(
      (item) =>
        item.clientNumber.toLowerCase() === reference.trim().toLowerCase() ||
        normalize(item.displayName) === wanted,
    ) ?? (items.length === 1 ? items[0] : undefined)
  );
}

function ok<T>(
  filters: Record<string, string>,
  items: T[],
  total: number,
): AssistantListResult<T> {
  return {
    status: "OK",
    filters,
    items,
    total,
    truncated: total > items.length,
  };
}

function caseLabel(item: Pick<CaseReference, "caseNumber" | "name">): string {
  return `${item.caseNumber} · ${toLatin(item.name)}`;
}

function taskItem(item: TaskDetail, today: string): AssistantWorkItem {
  const due = dueOf(item.dueDate, item.dueAt);
  return {
    kind: "TASK",
    title: toLatin(item.title),
    status: item.status,
    type: item.priority,
    due,
    overdue:
      OPEN_ITEM_STATUSES.has(item.status) && !!due && due.slice(0, 10) < today,
    person: toLatin(item.assigneeUser.displayName),
    case: item.case ? caseLabel(item.case) : null,
    client: item.client ? toLatin(item.client.displayName) : null,
    location: null,
  };
}

function deadlineItem(item: DeadlineDetail): AssistantWorkItem {
  return {
    kind: "DEADLINE",
    title: toLatin(item.title),
    status: item.status,
    type: item.type,
    due: dueOf(item.dueDate, item.dueAt),
    overdue: item.overdue,
    person: toLatin(item.responsibleUser.displayName),
    case: item.case ? caseLabel(item.case) : null,
    client: item.client ? toLatin(item.client.displayName) : null,
    location: null,
  };
}

function eventItem(item: EventDetail): AssistantWorkItem {
  const people = [
    item.organizerUser,
    ...item.assigneeUsers.filter((user) => user.id !== item.organizerUser.id),
  ];
  const place = [item.courtName, item.courtroom, item.location]
    .filter(Boolean)
    .join(", ");
  return {
    kind: "EVENT",
    title: toLatin(item.title),
    status: item.status,
    type: item.type,
    due: item.isAllDay
      ? belgradeDateTime(item.startsAt).slice(0, 10)
      : belgradeDateTime(item.startsAt),
    overdue: false,
    person: toLatin(people.map((user) => user.displayName).join(", ")),
    case: item.case ? caseLabel(item.case) : null,
    client: item.clients.length
      ? toLatin(item.clients.map((client) => client.displayName).join(", "))
      : null,
    location: place ? toLatin(place) : null,
  };
}

function calendarItem(item: CalendarItem, today: string): AssistantWorkItem {
  const due = item.startsAt ? belgradeDateTime(item.startsAt) : item.date;
  return {
    kind: item.sourceType,
    title: toLatin(item.title),
    status: item.status,
    type: null,
    due,
    overdue:
      OPEN_ITEM_STATUSES.has(item.status) && !!due && due.slice(0, 10) < today,
    person: item.responsibleUser
      ? toLatin(item.responsibleUser.displayName)
      : null,
    case: item.case ? caseLabel(item.case) : null,
    client: item.client ? toLatin(item.client.displayName) : null,
    location: null,
  };
}

function byDue(left: AssistantWorkItem, right: AssistantWorkItem): number {
  if (left.due === right.due) return 0;
  if (!left.due) return 1;
  if (!right.due) return -1;
  return left.due.localeCompare(right.due);
}

function dueOf(dueDate: string | null, dueAt: string | null): string | null {
  if (dueAt) return belgradeDateTime(dueAt);
  return dueDate ? dueDate.slice(0, 10) : null;
}

function clipText(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  const latin = toLatin(text);
  return latin.length > TEXT_MAX_CHARS
    ? `${latin.slice(0, TEXT_MAX_CHARS - 1)}…`
    : latin;
}

/** Lowercase Latin without diacritics, for name matching. */
function normalize(value: string): string {
  return toLatin(value)
    .trim()
    .toLowerCase()
    .replace(/đ/g, "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

function tokens(value: string): string[] {
  return value.split(/[^a-z0-9]+/).filter(Boolean);
}

/** YYYY-MM-DD HH:mm in Europe/Belgrade. */
export function belgradeDateTime(value: string | Date): string {
  return BELGRADE_DATE_TIME.format(new Date(value));
}

/** The instant a Belgrade calendar day starts. */
export function belgradeStart(day: string): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  const wallClock = Date.parse(
    `${belgradeDateTime(utcMidnight).replace(" ", "T")}:00Z`,
  );
  return new Date(utcMidnight.getTime() - (wallClock - utcMidnight.getTime()));
}

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

function minDay(left: string, right: string): string {
  return left < right ? left : right;
}
