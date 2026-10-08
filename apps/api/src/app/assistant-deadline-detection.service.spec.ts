import { FakeChatModelProvider } from "@law/llm";
import type { AssistantTurnScope } from "@law/mastra";
import {
  AI_ACCESS_OFF_MESSAGE,
  AssistantDeadlineDetectionService,
  ChatRuntimeConfig,
} from "@law/chat";

const scope: AssistantTurnScope = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-turn",
  correlationId: "corr-1",
  messageId: "message-1",
  language: "sr",
  userId: "user-1",
  userDisplayName: "Ana Advokat",
};

const PRESUDA = [
  "OSNOVNI SUD U BEOGRADU P 123/2026 dana 15.09.2026.",
  "PRESUDA: ODBIJA SE tužbeni zahtev.",
  "POUKA O PRAVNOM LEKU: Protiv ove presude dozvoljena je žalba u roku od 15 dana od dana prijema.",
].join("\n");

const CLASSIFIED = {
  actKind: "FIRST_INSTANCE_JUDGMENT",
  civilProcedure: "GENERAL",
  actTitle: "Presuda Osnovnog suda u Beogradu",
  caseNumber: "P 123/2026",
  decisionDate: "2026-09-15",
  remedyQuote: "dozvoljena je žalba u roku od 15 dana",
  statedPeriodDays: 15,
};

function setup(
  options: {
    documents?: unknown[];
    output?: unknown;
    proposal?: unknown;
  } = {},
) {
  const documentReads = {
    documentsByRef: jest.fn().mockResolvedValue(
      options.documents ?? [
        {
          id: "att:presuda",
          name: "Presuda.pdf",
          mimeType: "presuda.pdf",
          status: "COMPLETED",
          text: PRESUDA,
        },
      ],
    ),
  };
  const actions = {
    propose: jest.fn().mockResolvedValue(
      options.proposal ?? {
        status: "CONFIRMATION_REQUIRED",
        pendingActionId: "action-1",
        summary: "Novi rok",
        details: [],
      },
    ),
  };
  const service = new AssistantDeadlineDetectionService(
    new ChatRuntimeConfig(),
    documentReads as never,
    actions as never,
    new FakeChatModelProvider(options.output ?? CLASSIFIED),
  );
  return { service, documentReads, actions };
}

describe("AssistantDeadlineDetectionService", () => {
  beforeEach(() => {
    // Only Date is faked; the Mastra run keeps real timers.
    jest.useFakeTimers({
      now: new Date("2026-10-07T10:00:00.000Z"),
      doNotFake: [
        "hrtime",
        "nextTick",
        "performance",
        "queueMicrotask",
        "setImmediate",
        "clearImmediate",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
  });
  afterEach(() => jest.useRealTimers());

  it("proposes the computed deadline on the linked case", async () => {
    const { service, actions } = setup();

    const result = await service.detectDeadlines(scope, {
      documentRef: "att:presuda",
      serviceDate: "2026-10-02",
    });

    expect(actions.propose).toHaveBeenCalledWith(scope, {
      type: "create_deadline",
      title: "Žalba protiv presude – P 123/2026",
      dueDate: "2026-10-19",
      deadlineType: "COURT",
      description: expect.stringContaining("ZPP čl. 367 st. 1"),
    });
    expect(result).toMatchObject({
      status: "PROPOSED",
      pendingActionId: "action-1",
      document: "Presuda.pdf",
      act: "Prvostepena presuda u parnici: Presuda Osnovnog suda u Beogradu",
      remedy: "Žalba protiv presude",
      days: 15,
      serviceDate: "2026-10-02",
      serviceDateSource: "USER",
      dueDate: "2026-10-19",
    });
    expect((result as { computation: string }).computation).toContain(
      "rok ističe 19.10.2026.",
    );
  });

  it("asks for the service date and proposes nothing", async () => {
    const { service, actions } = setup();

    await expect(
      service.detectDeadlines(scope, { documentRef: "att:presuda" }),
    ).resolves.toMatchObject({
      status: "NEEDS_SERVICE_DATE",
      remedy: "Žalba protiv presude",
      legalBasis: "ZPP čl. 367 st. 1",
    });
    expect(actions.propose).not.toHaveBeenCalled();
  });

  it("does not propose an expired deadline", async () => {
    const { service, actions } = setup();

    await expect(
      service.detectDeadlines(scope, {
        documentRef: "att:presuda",
        serviceDate: "2026-09-16",
      }),
    ).resolves.toMatchObject({ status: "EXPIRED", dueDate: "2026-10-01" });
    expect(actions.propose).not.toHaveBeenCalled();
  });

  it("reports the date when the proposal is refused", async () => {
    const { service } = setup({
      proposal: {
        status: "INVALID",
        message: "Razgovor nije povezan sa predmetom.",
      },
    });

    await expect(
      service.detectDeadlines(scope, {
        documentRef: "att:presuda",
        serviceDate: "2026-10-02",
      }),
    ).resolves.toMatchObject({
      status: "NOT_PROPOSED",
      dueDate: "2026-10-19",
      message: "Razgovor nije povezan sa predmetom.",
    });
  });

  it("returns no deadline for a document without one", async () => {
    const { service, actions } = setup({ output: { actKind: "OTHER" } });

    await expect(
      service.detectDeadlines(scope, {
        documentRef: "att:presuda",
        serviceDate: "2026-10-02",
      }),
    ).resolves.toMatchObject({ status: "NO_DEADLINE" });
    expect(actions.propose).not.toHaveBeenCalled();
  });

  it("rejects a service date in the future", async () => {
    const { service } = setup();

    await expect(
      service.detectDeadlines(scope, {
        documentRef: "att:presuda",
        serviceDate: "2026-10-09",
      }),
    ).resolves.toMatchObject({ status: "INVALID" });
  });

  it("handles missing, unreadable, and failed documents", async () => {
    await expect(
      setup({ documents: [] }).service.detectDeadlines(scope, {
        documentRef: "doc:x",
      }),
    ).resolves.toMatchObject({ status: "NOT_FOUND" });
    await expect(
      setup({
        documents: [{ id: "doc:x", name: "Sken", status: "FAILED" }],
      }).service.detectDeadlines(scope, { documentRef: "doc:x" }),
    ).resolves.toMatchObject({ status: "NO_TEXT" });
    await expect(
      setup({
        documents: [
          {
            id: "doc:x",
            name: "Tajni",
            status: "FAILED",
            note: AI_ACCESS_OFF_MESSAGE("Tajni"),
          },
        ],
      }).service.detectDeadlines(scope, { documentRef: "doc:x" }),
    ).resolves.toEqual({
      status: "AI_ACCESS_OFF",
      message: AI_ACCESS_OFF_MESSAGE("Tajni"),
    });
    await expect(
      setup({ output: { warnings: 3 } }).service.detectDeadlines(scope, {
        documentRef: "att:presuda",
      }),
    ).resolves.toMatchObject({ status: "FAILED" });
  });
});
