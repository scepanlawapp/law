import { BadRequestException, ConflictException } from "@nestjs/common";
import { MatterLinkService, splitPersonName } from "@law/chat";

describe("splitPersonName", () => {
  it("requires at least two name parts", () => {
    expect(splitPersonName("Petar")).toBeNull();
    expect(splitPersonName("Petar Petrović")).toEqual({
      firstName: "Petar",
      lastName: "Petrović",
    });
    expect(splitPersonName("Ana Marija Jović")).toEqual({
      firstName: "Ana Marija",
      lastName: "Jović",
    });
  });
});

describe("MatterLinkService", () => {
  const workspaceId = "workspace-1";
  const userId = "user-1";
  const brief = {
    jobType: "lawsuit",
    plaintiff: { name: "Petar Petrović", address: "Knez Mihailova 1" },
    defendant: { name: "Marko Marković", address: "Terazije 1" },
    competentCourt: "Osnovni sud u Beogradu",
    claimValue: "100000",
    legalBasis: ["ZOO čl. 154"],
    factualDescription: "Činjenice",
    evidence: ["Ugovor"],
    reliefSought: "Naknada štete",
    missingFields: ["JMBG tužioca"],
    confidence: 0.8,
    warnings: [],
  };

  function harness(overrides?: {
    sessionCaseId?: string | null;
    appliedCaseId?: string | null;
    appliedTaskKeys?: string[];
  }) {
    const logs: Array<Record<string, unknown>> = [];
    const prisma = {
      case: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
          if (where.id === "missing") return null;
          return {
            id: where.id,
            workspaceId,
            caseNumber: "2026-1",
            name: "Predmet",
            clientId: "client-1",
            responsibleUserId: userId,
            opposingPartyName: null,
            description: null,
            client: { displayName: "Petar Petrović" },
          };
        }),
        update: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => data,
        ),
      },
      chatSession: {
        create: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => ({
            id: "session-1",
            status: "ACTIVE",
            isDeleted: false,
            title: "New chat",
            createdAt: new Date("2026-09-21T00:00:00.000Z"),
            updatedAt: new Date("2026-09-21T00:00:00.000Z"),
            ...data,
          }),
        ),
        findFirst: jest.fn(async () => ({
          id: "session-1",
          workspaceId,
          caseId: overrides?.sessionCaseId ?? null,
          isDeleted: false,
        })),
        update: jest.fn(
          async ({ data }: { data: Record<string, unknown> }) => data,
        ),
      },
      draftResult: {
        updateMany: jest.fn(
          async ({ where }: { where: Record<string, unknown> }) => {
            return { where };
          },
        ),
      },
      briefExtractionResult: {
        findFirst: jest.fn(async () => ({
          id: "brief-1",
          sessionId: "session-1",
          workspaceId,
          brief,
          appliedCaseId: overrides?.appliedCaseId ?? null,
          appliedTaskKeys: overrides?.appliedTaskKeys ?? [],
        })),
        update: jest.fn(),
      },
      client: {
        findFirst: jest.fn(async () => ({ id: "client-1", status: "ACTIVE" })),
      },
      activityLog: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          logs.push(data);
          return data;
        }),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (input: unknown) => {
        if (typeof input === "function") {
          return input(prisma);
        }
        return input;
      }),
    };
    const cases = {
      nextNumberSuggestion: jest.fn(async () => ({ caseNumber: "2026-4" })),
      create: jest.fn(async () => ({
        id: "case-new",
        clientId: "client-1",
        caseNumber: "2026-4",
      })),
    };
    const clients = {
      list: jest.fn(async () => ({
        items: [
          {
            id: "client-1",
            displayName: "Petar Petrović",
            clientNumber: "C-1",
          },
        ],
      })),
      create: jest.fn(async () => ({ id: "client-new" })),
    };
    const work = {
      createTask: jest.fn(async () => ({ id: "task-1" })),
    };
    return {
      logs,
      prisma,
      cases,
      clients,
      work,
      service: new MatterLinkService(
        prisma as never,
        cases as never,
        clients as never,
        work as never,
      ),
    };
  }

  it("rejects a case outside the workspace", async () => {
    const { service } = harness();
    await expect(
      service.createSession({
        workspaceId,
        userId,
        caseId: "missing",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not move approved drafts when relinking", async () => {
    const { service, prisma } = harness({ sessionCaseId: "case-1" });
    prisma.chatSession.update.mockResolvedValue({
      id: "session-1",
      workspaceId,
      createdByUserId: userId,
      title: "Chat",
      status: "ACTIVE",
      isDeleted: false,
      caseId: "case-2",
      createdAt: new Date(),
      updatedAt: new Date(),
      case: null,
    });
    await service.linkSession({
      workspaceId,
      userId,
      sessionId: "session-1",
      caseId: "case-2",
    });
    expect(prisma.draftResult.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          approvalStatus: { not: "APPROVED" },
        }),
        data: { caseId: "case-2" },
      }),
    );
  });

  it("returns the existing case when the brief was already applied", async () => {
    const { service, cases } = harness({ appliedCaseId: "case-1" });
    const result = await service.applyBrief({
      workspaceId,
      userId,
      sessionId: "session-1",
      briefId: "brief-1",
      body: {
        client: { mode: "existing", clientId: "client-1" },
        caseNumber: "2026-9",
        name: "Novi",
        responsibleUserId: userId,
      },
    });
    expect(result.caseId).toBe("case-1");
    expect(result.createdClient).toBe(false);
    expect(cases.create).not.toHaveBeenCalled();
  });

  it("refuses a second case when the session is already linked", async () => {
    const { service } = harness({ sessionCaseId: "case-1" });
    await expect(
      service.applyBrief({
        workspaceId,
        userId,
        sessionId: "session-1",
        briefId: "brief-1",
        body: {
          client: { mode: "create", firstName: "Petar", lastName: "Petrović" },
          caseNumber: "2026-9",
          name: "Novi",
          responsibleUserId: userId,
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("does not create a client from an unsplit name", async () => {
    const { service } = harness();
    await expect(
      service.applyBrief({
        workspaceId,
        userId,
        sessionId: "session-1",
        briefId: "brief-1",
        body: {
          client: { mode: "create", firstName: "Petar", lastName: " " },
          caseNumber: "2026-9",
          name: "Novi",
          responsibleUserId: userId,
        },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("stores the defendant as opposing-party text", async () => {
    const { service, prisma, logs } = harness();
    await service.applyBrief({
      workspaceId,
      userId,
      sessionId: "session-1",
      briefId: "brief-1",
      body: {
        client: { mode: "existing", clientId: "client-1" },
        caseNumber: "2026-4",
        name: "Naknada štete",
        description: "Činjenice",
        responsibleUserId: userId,
        opposingPartyName: "Marko Marković",
        opposingPartyAddress: "Terazije 1",
      },
    });
    expect(prisma.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          opposingPartyName: "Marko Marković",
          opposingPartyAddress: "Terazije 1",
        },
      }),
    );
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "CASE_CREATED",
          metadata: expect.objectContaining({ source: "AI_ASSISTED" }),
        }),
      ]),
    );
  });

  it("skips already applied task keys and does not set a due date", async () => {
    const { service, work } = harness({
      appliedCaseId: "case-1",
      appliedTaskKeys: ["missing:0"],
    });
    const result = await service.applyTasks({
      workspaceId,
      userId,
      sessionId: "session-1",
      briefId: "brief-1",
      body: {
        tasks: [
          { key: "missing:0" },
          { key: "evidence:0", title: "Pripremi ugovor" },
        ],
      },
    });
    expect(result.skippedKeys).toEqual(["missing:0"]);
    expect(result.createdTaskIds).toEqual(["task-1"]);
    expect(work.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Pripremi ugovor",
        caseId: "case-1",
      }),
    );
    const payload = JSON.parse(
      JSON.stringify(work.createTask.mock.calls),
    ) as Array<Array<{ dueDate?: string; dueAt?: string }>>;
    expect(payload[0][0].dueDate).toBeUndefined();
    expect(payload[0][0].dueAt).toBeUndefined();
  });
});
