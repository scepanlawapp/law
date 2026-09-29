import { NotFoundException } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import {
  AssistantOfficeReadsService,
  belgradeDateTime,
  belgradeStart,
} from "@law/chat";
import type { AssistantTurnScope } from "@law/mastra";

const scope: AssistantTurnScope = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-turn",
  correlationId: "corr-1",
  messageId: "message-1",
  language: "sr",
  userId: "user-ana",
  userDisplayName: "Ana Anić",
};

const user = (id: string, displayName: string) => ({
  id,
  displayName,
  email: null,
});
const caseRef = {
  id: "case-1",
  caseNumber: "P-1/2026",
  name: "Spor oko zarade",
  status: "ACTIVE",
  priority: "NORMAL",
};
const clientSummary = (
  id: string,
  displayName: string,
  clientNumber: string,
) => ({
  id,
  clientNumber,
  type: "INDIVIDUAL",
  displayName,
  status: "ACTIVE",
  email: "klijent@example.test",
  phone: null,
  responsibleUser: user("user-ana", "Ana Anić"),
  activeCaseCount: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const page = <T>(items: T[], totalItems = items.length) => ({
  items,
  meta: { totalItems },
});

function member(userId: string, firstName: string, lastName: string) {
  return {
    userId,
    user: {
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}@example.test`,
    },
  };
}

function setup() {
  const prisma = {
    workspaceMember: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          member("user-ana", "Ana", "Anić"),
          member("user-marko", "Marko", "Marković"),
          member("user-ana-2", "Ana", "Petrović"),
        ]),
    },
    task: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "task-1", title: "Pozvati svedoka" }]),
    },
    deadline: { findMany: jest.fn().mockResolvedValue([]) },
    event: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cases = {
    list: jest.fn().mockResolvedValue(page([])),
    get: jest.fn().mockResolvedValue({
      ...caseRef,
      client: { displayName: "Petar Petrović" },
      responsibleUser: user("user-ana", "Ana Anić"),
      openedDate: null,
      closedDate: null,
      description: null,
      opposingPartyName: null,
    }),
    listActivities: jest.fn().mockResolvedValue([]),
    listResponsibilities: jest.fn().mockResolvedValue([]),
  };
  const clients = {
    list: jest.fn().mockResolvedValue(page([])),
    get: jest.fn(),
    listContacts: jest.fn().mockResolvedValue([]),
    listCases: jest.fn().mockResolvedValue(page([])),
    listActivities: jest.fn().mockResolvedValue(page([])),
  };
  const work = {
    listTasks: jest.fn().mockResolvedValue(page([])),
    listDeadlines: jest.fn().mockResolvedValue(page([])),
    listEvents: jest.fn().mockResolvedValue(page([])),
    calendar: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
    listActivity: jest.fn().mockResolvedValue(page([])),
  };
  const service = new AssistantOfficeReadsService(
    prisma as never,
    cases as never,
    clients as never,
    work as never,
  );
  return { prisma, cases, clients, work, service };
}

function inWorkspace<T>(fn: () => Promise<T>, workspaceId = "workspace-1") {
  return WorkspaceContextService.run(
    { userId: "system-workflow", workspaceId, role: WorkspaceRole.ADMIN },
    fn,
  );
}

const workQuery = {
  kind: "all" as const,
  state: "open" as const,
  linkedCaseId: null,
};

describe("Belgrade date helpers", () => {
  it("finds the instant a Belgrade day starts in summer and winter", () => {
    expect(belgradeStart("2026-09-28").toISOString()).toBe(
      "2026-09-27T22:00:00.000Z",
    );
    expect(belgradeStart("2026-12-01").toISOString()).toBe(
      "2026-11-30T23:00:00.000Z",
    );
    expect(belgradeDateTime("2026-09-28T07:30:00.000Z")).toBe(
      "2026-09-28 09:30",
    );
  });
});

describe("AssistantOfficeReadsService", () => {
  afterEach(() => jest.useRealTimers());

  it("refuses when the job's workspace differs from the tool's workspace", async () => {
    const { work, service } = setup();

    const result = await inWorkspace(
      () => service.listWorkItems(scope, workQuery),
      "workspace-2",
    );

    expect(result).toMatchObject({ status: "UNAVAILABLE" });
    expect(work.listTasks).not.toHaveBeenCalled();
  });

  it("defaults work items to the current user when no case is linked", async () => {
    const { work, service } = setup();

    const result = await inWorkspace(() =>
      service.listWorkItems(scope, workQuery),
    );

    expect(work.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        assigneeUserId: "user-ana",
        caseId: undefined,
        statuses: ["TODO", "IN_PROGRESS"],
        pageSize: 20,
      }),
    );
    expect(work.listDeadlines).toHaveBeenCalledWith(
      expect.objectContaining({
        responsibleUserId: "user-ana",
        statuses: ["OPEN"],
      }),
    );
    expect(work.listEvents).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-ana", statuses: ["SCHEDULED"] }),
    );
    expect(result).toMatchObject({
      status: "OK",
      filters: { osoba: "Ana Anić", stanje: "open" },
    });
  });

  it("defaults work items to the linked case for the whole office", async () => {
    const { work, service } = setup();

    const result = await inWorkspace(() =>
      service.listWorkItems(scope, { ...workQuery, linkedCaseId: "case-1" }),
    );

    expect(work.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: "case-1", assigneeUserId: undefined }),
    );
    expect(result).toMatchObject({
      filters: { obuhvat: "povezani predmet P-1/2026 · Spor oko zarade" },
    });
  });

  it("resolves colleagues by inflected name and reports ambiguity", async () => {
    const { work, service } = setup();

    await inWorkspace(() =>
      service.listWorkItems(scope, {
        ...workQuery,
        kind: "task",
        person: "Marka",
      }),
    );
    const ambiguous = await inWorkspace(() =>
      service.listWorkItems(scope, { ...workQuery, person: "Ana" }),
    );
    const unknown = await inWorkspace(() =>
      service.listWorkItems(scope, { ...workQuery, person: "Zoran" }),
    );
    const office = await inWorkspace(() =>
      service.listWorkItems(scope, { ...workQuery, person: "office" }),
    );

    expect(work.listTasks).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ assigneeUserId: "user-marko" }),
    );
    expect(work.listDeadlines).toHaveBeenCalledTimes(1);
    expect(ambiguous).toEqual({
      status: "AMBIGUOUS",
      message: expect.any(String),
      candidates: ["Ana Anić", "Ana Petrović"],
    });
    expect(unknown).toMatchObject({ status: "NOT_FOUND" });
    expect(office).toMatchObject({
      status: "OK",
      filters: { osoba: "cela kancelarija" },
    });
    expect(work.listTasks).toHaveBeenLastCalledWith(
      expect.objectContaining({ assigneeUserId: undefined }),
    );
  });

  it("lists overdue items before today, skips events, and reports truncation", async () => {
    jest.useFakeTimers({ now: new Date("2026-09-27T10:00:00.000Z") });
    const { work, service } = setup();
    work.listTasks.mockResolvedValue(
      page(
        [
          {
            title: "Pozvati svedoka",
            status: "TODO",
            priority: "HIGH",
            assigneeUser: user("user-ana", "Ana Anić"),
            dueDate: "2026-09-20T00:00:00.000Z",
            dueAt: null,
            case: caseRef,
            client: null,
          },
        ],
        30,
      ),
    );

    const result = await inWorkspace(() =>
      service.listWorkItems(scope, { ...workQuery, overdueOnly: true }),
    );

    expect(work.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ to: "2026-09-26T22:00:00.000Z" }),
    );
    expect(work.listEvents).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: "OK",
      filters: expect.objectContaining({ samoZakasneli: "da" }),
      items: [
        {
          kind: "TASK",
          title: "Pozvati svedoka",
          status: "TODO",
          type: "HIGH",
          due: "2026-09-20",
          overdue: true,
          person: "Ana Anić",
          case: "P-1/2026 · Spor oko zarade",
          client: null,
          location: null,
        },
      ],
      total: 30,
      truncated: true,
    });
  });

  it("asks for a clearer case reference instead of guessing", async () => {
    const { cases, work, service } = setup();
    cases.list.mockResolvedValue(
      page([
        { ...caseRef, id: "a", caseNumber: "P-3/2026", name: "Razvod" },
        { ...caseRef, id: "b", caseNumber: "P-4/2026", name: "Razvod" },
      ]),
    );

    const result = await inWorkspace(() =>
      service.listWorkItems(scope, { ...workQuery, case: "Razvod" }),
    );

    expect(result).toEqual({
      status: "AMBIGUOUS",
      message: expect.any(String),
      candidates: ["P-3/2026 · Razvod", "P-4/2026 · Razvod"],
    });
    expect(work.listTasks).not.toHaveBeenCalled();
  });

  it("builds an agenda for a colleague and limits the range", async () => {
    const { work, service } = setup();
    work.calendar.mockResolvedValue({
      items: [
        {
          sourceType: "EVENT",
          title: "Ročište",
          status: "SCHEDULED",
          startsAt: "2026-09-28T07:30:00.000Z",
          date: null,
          case: caseRef,
          client: null,
          responsibleUser: user("user-marko", "Marko Marković"),
        },
      ],
      nextCursor: "EVENT:x",
    });

    const agenda = await inWorkspace(() =>
      service.getAgenda(scope, {
        from: "2026-09-28",
        to: "2026-09-28",
        person: "Marko",
      }),
    );
    const tooLong = await inWorkspace(() =>
      service.getAgenda(scope, { from: "2026-09-01", to: "2026-10-15" }),
    );

    expect(work.calendar).toHaveBeenCalledTimes(1);
    expect(work.calendar).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "2026-09-27T22:00:00.000Z",
        to: "2026-09-28T22:00:00.000Z",
        userIds: ["user-marko"],
        limit: 50,
      }),
    );
    expect(agenda).toMatchObject({
      status: "OK",
      filters: { osoba: "Marko Marković" },
      items: [
        { kind: "EVENT", due: "2026-09-28 09:30", person: "Marko Marković" },
      ],
      truncated: true,
    });
    expect(tooLong).toMatchObject({ status: "INVALID" });
  });

  it("reads a client without personal identifiers", async () => {
    const { clients, service } = setup();
    clients.list.mockResolvedValue(
      page([clientSummary("client-1", "Petar Petrović", "K-7")]),
    );
    clients.get.mockResolvedValue({
      ...clientSummary("client-1", "Petar Petrović", "K-7"),
      jmbg: "0101990710000",
      taxNumber: null,
      registrationNumber: null,
      notes: "x".repeat(900),
    });
    clients.listContacts.mockResolvedValue([
      {
        firstName: "Jelena",
        lastName: "Petrović",
        position: null,
        email: null,
        phone: "060",
        isPrimary: true,
        status: "ACTIVE",
      },
      {
        firstName: "Stari",
        lastName: "Kontakt",
        status: "INACTIVE",
      },
    ]);
    clients.listCases.mockResolvedValue(
      page([
        {
          caseNumber: "P-1/2026",
          name: "Spor",
          status: "ACTIVE",
          priority: "NORMAL",
        },
        {
          caseNumber: "P-0/2025",
          name: "Stari",
          status: "CLOSED",
          priority: "LOW",
        },
      ]),
    );

    const result = await inWorkspace(() =>
      service.getClient(scope, { reference: "Petrović" }),
    );

    expect(result.found).toBe("one");
    const client = (result as unknown as { client: Record<string, unknown> })
      .client;
    expect(JSON.stringify(client)).not.toContain("0101990710000");
    expect(client["contacts"]).toEqual([
      expect.objectContaining({ name: "Jelena Petrović", isPrimary: true }),
    ]);
    expect(client["openCases"]).toEqual([
      expect.objectContaining({ caseNumber: "P-1/2026" }),
    ]);
    expect((client["notes"] as string).length).toBe(500);
  });

  it("merges journal entries and work-item changes, newest first", async () => {
    const { cases, work, service } = setup();
    cases.listActivities.mockResolvedValue([
      {
        type: "MEETING",
        title: "Sastanak sa klijentom",
        description: null,
        activityDate: new Date("2026-09-20T09:00:00.000Z"),
        createdByUserId: "user-marko",
      },
    ]);
    work.listActivity.mockResolvedValue(
      page([
        {
          action: "TASK_CREATED",
          actorUserId: "user-ana",
          occurredAt: "2026-09-26T08:00:00.000Z",
          entityType: "Task",
          entityId: "task-1",
        },
      ]),
    );

    const result = await inWorkspace(() =>
      service.listActivity(scope, {
        limit: 10,
        linkedCaseId: "case-1",
      }),
    );

    expect(result).toMatchObject({
      status: "OK",
      items: [
        {
          kind: "LOG",
          type: "TASK_CREATED",
          title: "Pozvati svedoka",
          author: "Ana Anić",
        },
        {
          kind: "JOURNAL",
          title: "Sastanak sa klijentom",
          author: "Marko Marković",
        },
      ],
      total: 2,
      truncated: false,
    });
  });

  it("asks for a target when there is no case or client for the activity", async () => {
    const { service } = setup();

    const result = await inWorkspace(() =>
      service.listActivity(scope, {
        limit: 10,
        linkedCaseId: null,
      }),
    );

    expect(result).toMatchObject({ status: "INVALID" });
  });

  it("turns a missing record into NOT_FOUND", async () => {
    const { cases, service } = setup();
    cases.get.mockRejectedValue(new NotFoundException());

    const result = await inWorkspace(() =>
      service.listWorkItems(scope, { ...workQuery, linkedCaseId: "gone" }),
    );

    expect(result).toMatchObject({ status: "NOT_FOUND" });
  });

  it("adds responsible lawyers and open work counts to a case", async () => {
    const { cases, work, service } = setup();
    cases.listResponsibilities.mockResolvedValue([
      { userId: "user-marko", endedAt: null },
      { userId: "user-ana", endedAt: new Date() },
    ]);
    work.listTasks.mockResolvedValue(page([], 4));
    work.listDeadlines.mockResolvedValue(page([], 2));

    const extras = await inWorkspace(() =>
      service.caseExtras("workspace-1", "case-1"),
    );

    expect(extras).toEqual({
      responsibleLawyers: ["Marko Marković"],
      openTaskCount: 4,
      openDeadlineCount: 2,
    });
  });
});
