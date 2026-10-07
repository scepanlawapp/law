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
        count: jest.fn(async () => 12),
        findMany: jest.fn(async () => [
          {
            id: "session-1",
            title: "Chat",
            updatedAt: new Date("2026-09-21T00:00:00.000Z"),
          },
        ]),
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
        count: jest.fn(async () => 12),
        findMany: jest.fn(async () => [
          {
            id: "draft-1",
            sessionId: "session-1",
            approvalStatus: "PENDING",
            reviewedAt: null,
            createdAt: new Date("2026-09-20T00:00:00.000Z"),
            warnings: [],
          },
        ]),
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
      documentAnalysis: {
        findFirst: jest.fn(async () => null as unknown),
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
    const promotion = { promoteSession: jest.fn(async () => 1) };
    return {
      logs,
      prisma,
      cases,
      clients,
      work,
      promotion,
      service: new MatterLinkService(
        prisma as never,
        cases as never,
        clients as never,
        work as never,
        promotion as never,
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

  it("paginates sessions and drafts linked to a case", async () => {
    const { service, prisma } = harness();

    const result = await service.listForCase(workspaceId, "case-1", {
      page: 2,
      draftPage: 3,
      pageSize: 5,
    });

    expect(prisma.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
    expect(prisma.draftResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 5 }),
    );
    expect(result.sessions.meta).toMatchObject({
      page: 2,
      totalItems: 12,
      totalPages: 3,
    });
    expect(result.drafts.meta).toMatchObject({
      page: 3,
      totalItems: 12,
      totalPages: 3,
    });
    expect(result.latestTimeline).toBeNull();
  });

  it("returns the case's latest timeline with a summary and event count", async () => {
    const { service, prisma } = harness();
    prisma.documentAnalysis.findFirst.mockResolvedValueOnce({
      id: "analysis-9",
      sessionId: "session-4",
      caseId: "case-1",
      kind: "CASE_TIMELINE",
      documentRef: "case:case-1",
      documentTitle: "Predmet 2026-1",
      contractType: null,
      clientSide: null,
      result: {
        summary: "Spor oko ugovora.",
        events: [{ title: "A" }, { title: "B" }],
        openQuestions: [],
        sources: [],
        warnings: [],
      },
      citations: [],
      truncated: false,
      model: "m",
      createdAt: new Date("2026-10-07T09:00:00.000Z"),
    });

    const result = await service.listForCase(workspaceId, "case-1", {
      page: 1,
      draftPage: 1,
      pageSize: 5,
    });

    expect(prisma.documentAnalysis.findFirst).toHaveBeenCalledWith({
      where: { workspaceId, caseId: "case-1", kind: "CASE_TIMELINE" },
      orderBy: { createdAt: "desc" },
    });
    expect(result.latestTimeline).toEqual({
      id: "analysis-9",
      sessionId: "session-4",
      createdAt: "2026-10-07T09:00:00.000Z",
      summary: "Spor oko ugovora.",
      eventCount: 2,
    });
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

  it("files the chat attachments on the case after linking or applying a brief", async () => {
    const { service, prisma, promotion } = harness({ sessionCaseId: "case-1" });
    prisma.chatSession.update.mockResolvedValue({
      id: "session-1",
      title: "Chat",
      status: "ACTIVE",
      caseId: "case-2",
      case: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await service.linkSession({
      workspaceId,
      userId,
      sessionId: "session-1",
      caseId: "case-2",
    });
    expect(promotion.promoteSession).toHaveBeenCalledWith(
      workspaceId,
      "session-1",
    );

    promotion.promoteSession.mockClear();
    await service.linkSession({
      workspaceId,
      userId,
      sessionId: "session-1",
      caseId: null,
    });
    expect(promotion.promoteSession).not.toHaveBeenCalled();

    const fresh = harness();
    await fresh.service.applyBrief({
      workspaceId,
      userId,
      sessionId: "session-1",
      briefId: "brief-1",
      body: {
        client: { mode: "existing", clientId: "client-1" },
        caseNumber: "2026-5",
        name: "Novi",
        responsibleUserId: userId,
      },
    });
    expect(fresh.promotion.promoteSession).toHaveBeenCalledWith(
      workspaceId,
      "session-1",
    );
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

  it("skips already applied legacy task keys and dates the created task", async () => {
    jest.useFakeTimers({ now: new Date("2026-09-25T10:00:00") }); // Friday
    try {
      const { service, work } = harness({
        appliedCaseId: "case-1",
        appliedTaskKeys: ["missing:0"],
      });
      const preview = await service.previewTasks({
        workspaceId,
        sessionId: "session-1",
        briefId: "brief-1",
      });
      expect(preview.proposals[0]).toMatchObject({
        key: "missing:plaintiffIdNumber:0",
        alreadyApplied: true,
      });
      const result = await service.applyTasks({
        workspaceId,
        userId,
        sessionId: "session-1",
        briefId: "brief-1",
        body: {
          tasks: [
            { key: "missing:plaintiffIdNumber:0" },
            { key: "evidence:0", title: "Pripremi ugovor" },
          ],
        },
      });
      expect(result.skippedKeys).toEqual(["missing:plaintiffIdNumber:0"]);
      expect(result.createdTaskIds).toEqual(["task-1"]);
      expect(work.createTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pripremi ugovor",
          caseId: "case-1",
          dueDate: "2026-09-30",
          priority: "NORMAL",
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it("proposes action-phrased, dated tasks and skips attached evidence", async () => {
    jest.useFakeTimers({ now: new Date("2026-09-25T10:00:00") }); // Friday
    try {
      const { service, prisma, work } = harness({ appliedCaseId: "case-1" });
      prisma.briefExtractionResult.findFirst.mockResolvedValueOnce({
        id: "brief-1",
        sessionId: "session-1",
        workspaceId,
        brief: {
          ...brief,
          evidence: [
            { label: "Rešenje o otkazu", provided: true },
            { label: "Ugovor o radu", provided: false },
          ],
          missingFields: [
            { key: "defendantAddress", label: "Adresa tuženog" },
            { key: "serviceDate", label: "Datum dostavljanja rešenja" },
            { key: "other", label: "Razlog otkaza" },
          ],
        },
        appliedCaseId: "case-1",
        appliedTaskKeys: [],
      });
      const preview = await service.previewTasks({
        workspaceId,
        sessionId: "session-1",
        briefId: "brief-1",
      });
      expect(
        preview.proposals.map(
          ({ key, title, priority, dueDate, selectedByDefault }) => ({
            key,
            title,
            priority,
            dueDate,
            selectedByDefault,
          }),
        ),
      ).toEqual([
        {
          key: "missing:defendantAddress:0",
          title: "Pribaviti adresu tuženog",
          priority: "NORMAL",
          dueDate: "2026-09-30",
          selectedByDefault: true,
        },
        {
          key: "missing:serviceDate:1",
          title: "Utvrditi datum dostavljanja osporenog akta",
          priority: "HIGH",
          dueDate: "2026-09-28",
          selectedByDefault: true,
        },
        {
          key: "missing:other:2",
          title: "Pribaviti podatak: Razlog otkaza",
          priority: "NORMAL",
          dueDate: "2026-09-30",
          selectedByDefault: true,
        },
        {
          key: "evidence:1",
          title: "Pribaviti dokaz: Ugovor o radu",
          priority: "NORMAL",
          dueDate: "2026-09-30",
          selectedByDefault: false,
        },
      ]);
      expect(preview.proposals[0].description).not.toContain("brief-1");
      expect(work.createTask).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
  it("previews a legacy lawsuit brief with the plaintiff as client", async () => {
    const { service } = harness();
    const preview = await service.previewBrief({
      workspaceId,
      userId,
      sessionId: "session-1",
      briefId: "brief-1",
    });
    expect(preview).toMatchObject({
      documentType: "LAWSUIT",
      clientRole: "plaintiff",
      clientPartyName: "Petar Petrović",
      opposingPartyName: "Marko Marković",
      opposingPartyAddress: "Terazije 1",
      suggestedCaseName: "Naknada štete",
    });
    expect(preview.parties.map((party) => party.label)).toEqual([
      "Tužilac",
      "Tuženi",
    ]);
    expect(preview.suggestedDescription).toContain(
      "Nadležni sud: Osnovni sud u Beogradu",
    );
  });

  it("uses the defendant as client for a statement of defence and honours a role switch", async () => {
    const { service, prisma, clients } = harness();
    const defence = {
      documentType: "STATEMENT_OF_DEFENCE",
      parties: [
        { role: "defendant", name: "Alfa d.o.o.", address: "Terazije 1", idNumber: null },
        { role: "plaintiff", name: "Petar Petrović", address: null, idNumber: null },
      ],
      fields: [{ key: "defencePosition", value: "Osporava se u celini" }],
      legalBasis: [],
      factualDescription: null,
      evidence: [],
      missingFields: [],
      confidence: 0.7,
      warnings: [],
    };
    prisma.briefExtractionResult.findFirst.mockResolvedValue({
      id: "brief-1",
      sessionId: "session-1",
      workspaceId,
      brief: defence,
      appliedCaseId: null,
      appliedTaskKeys: [],
    });
    const preview = await service.previewBrief({
      workspaceId,
      userId,
      sessionId: "session-1",
      briefId: "brief-1",
    });
    expect(preview).toMatchObject({
      documentType: "STATEMENT_OF_DEFENCE",
      clientRole: "defendant",
      clientPartyName: "Alfa d.o.o.",
      opposingPartyName: "Petar Petrović",
      suggestedCaseName: "Osporava se u celini",
    });
    expect(clients.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: "Alfa d.o.o." }),
    );

    const switched = await service.previewBrief({
      workspaceId,
      userId,
      sessionId: "session-1",
      briefId: "brief-1",
      clientRole: "plaintiff",
    });
    expect(switched).toMatchObject({
      clientRole: "plaintiff",
      clientPartyName: "Petar Petrović",
      opposingPartyName: "Alfa d.o.o.",
    });

    const unknown = await service.previewBrief({
      workspaceId,
      userId,
      sessionId: "session-1",
      briefId: "brief-1",
      clientRole: "witness",
    });
    expect(unknown.clientRole).toBe("defendant");
  });

  it("phrases appeal tasks from the appeal registry", async () => {
    const { service, prisma } = harness({ appliedCaseId: "case-1" });
    prisma.briefExtractionResult.findFirst.mockResolvedValueOnce({
      id: "brief-1",
      sessionId: "session-1",
      workspaceId,
      brief: {
        documentType: "APPEAL",
        parties: [],
        fields: [],
        legalBasis: [],
        factualDescription: null,
        evidence: [{ label: "Presuda", provided: false }],
        missingFields: [
          { key: "contestedDecision", label: "Presuda" },
          { key: "opponentAddress", label: "Adresa protivne strane" },
          { key: "serviceDate", label: "Datum prijema presude" },
        ],
        confidence: 0.5,
        warnings: [],
      },
      appliedCaseId: "case-1",
      appliedTaskKeys: [],
    });
    const preview = await service.previewTasks({
      workspaceId,
      sessionId: "session-1",
      briefId: "brief-1",
    });
    expect(
      preview.proposals.map(({ title, priority }) => ({ title, priority })),
    ).toEqual([
      { title: "Pribaviti osporenu odluku", priority: "NORMAL" },
      { title: "Pribaviti adresu protivne strane", priority: "NORMAL" },
      {
        title: "Utvrditi datum dostavljanja osporenog akta",
        priority: "HIGH",
      },
      { title: "Pribaviti dokaz: Presuda", priority: "NORMAL" },
    ]);
    expect(preview.proposals[2].description).toContain("podnošenje žalbe");
    expect(preview.proposals[3].description).toContain("nacrtu žalbe");
  });
  it("words contract and media tasks for their family", async () => {
    const { service, prisma } = harness({ appliedCaseId: "case-1" });
    const base = {
      parties: [],
      fields: [],
      legalBasis: [],
      factualDescription: null,
      confidence: 0.5,
      warnings: [],
    };
    prisma.briefExtractionResult.findFirst
      .mockResolvedValueOnce({
        id: "brief-1",
        sessionId: "session-1",
        workspaceId,
        brief: {
          ...base,
          documentType: "SERVICES_CONTRACT",
          evidence: [{ label: "Izvod iz APR", provided: false }],
          missingFields: [{ key: "fee", label: "Naknada" }],
        },
        appliedCaseId: "case-1",
        appliedTaskKeys: [],
      })
      .mockResolvedValueOnce({
        id: "brief-1",
        sessionId: "session-1",
        workspaceId,
        brief: {
          ...base,
          documentType: "MEDIA_REPLY_REQUEST",
          evidence: [],
          missingFields: [
            { key: "publicationDate", label: "Datum objavljivanja" },
          ],
        },
        appliedCaseId: "case-1",
        appliedTaskKeys: [],
      });

    const contract = await service.previewTasks({
      workspaceId,
      sessionId: "session-1",
      briefId: "brief-1",
    });
    expect(contract.documentFamily).toBe("CONTRACT");
    expect(contract.proposals.map((task) => task.title)).toEqual([
      "Utvrditi naknadu i uslove plaćanja",
      "Pribaviti prilog: Izvod iz APR",
    ]);
    expect(contract.proposals[1].description).toBe(
      "Prilog je potreban za nacrt ugovora o pružanju usluga, a nije priložen u razgovoru: Izvod iz APR.",
    );

    const media = await service.previewTasks({
      workspaceId,
      sessionId: "session-1",
      briefId: "brief-1",
    });
    expect(media.documentFamily).toBe("LETTER");
    expect(media.proposals[0]).toMatchObject({
      title: "Utvrditi datum objavljivanja sporne informacije",
      priority: "HIGH",
    });
    expect(media.proposals[0].description).toContain("datuma objavljivanja");
  });

  it("previews a single-party company decision without an opposing party", async () => {
    const { service, prisma } = harness();
    prisma.briefExtractionResult.findFirst.mockResolvedValue({
      id: "brief-1",
      sessionId: "session-1",
      workspaceId,
      brief: {
        documentType: "CORPORATE_DECISION",
        parties: [
          { role: "company", name: "Alfa d.o.o.", address: null, idNumber: null },
        ],
        fields: [{ key: "decisionSubject", value: "Imenovanje direktora" }],
        legalBasis: [],
        factualDescription: null,
        evidence: [],
        missingFields: [],
        confidence: 0.6,
        warnings: [],
      },
      appliedCaseId: null,
      appliedTaskKeys: [],
    });
    const preview = await service.previewBrief({
      workspaceId,
      userId,
      sessionId: "session-1",
      briefId: "brief-1",
    });
    expect(preview).toMatchObject({
      clientRole: "company",
      clientPartyName: "Alfa d.o.o.",
      opposingPartyName: null,
      suggestedCaseName: "Imenovanje direktora",
    });
    expect(preview.parties).toHaveLength(1);
  });
});
