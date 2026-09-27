import { AssistantContextBuilder, ChatRuntimeConfig } from "@law/chat";

const trigger = new Date("2026-09-27T10:05:00.000Z");

function row(
  role: "USER" | "ASSISTANT",
  content: string,
  minute: number,
  attachments: Array<{ originalName: string }> = [],
) {
  return {
    role,
    content,
    attachments,
    createdAt: new Date(`2026-09-27T10:0${minute}:00.000Z`),
  };
}

function setup(
  rows: ReturnType<typeof row>[],
  configOverrides: Partial<ChatRuntimeConfig> = {},
  drafting?: { workspaceState: jest.Mock },
) {
  const prisma = {
    chatSession: { findFirst: jest.fn().mockResolvedValue(null) },
    chatMessage: {
      findFirst: jest.fn().mockResolvedValue({ createdAt: trigger }),
      // Prisma returns newest first (orderBy desc).
      findMany: jest.fn().mockResolvedValue([...rows].reverse()),
    },
  };
  const matterLink = {
    sessionCaseId: jest.fn().mockResolvedValue("case-1"),
    caseContextBlock: jest
      .fn()
      .mockResolvedValue("Povezani predmet:\nNaziv: Спор о зарадама"),
  };
  const config = Object.assign(new ChatRuntimeConfig(), configOverrides);
  const builder = new AssistantContextBuilder(
    prisma as never,
    config,
    matterLink as never,
    drafting as never,
  );
  return { builder, prisma, matterLink };
}

describe("AssistantContextBuilder", () => {
  it("rebuilds the conversation up to the triggering message in Latin script", async () => {
    const { builder, prisma } = setup([
      row("USER", "Колики је рок застарелости?", 1),
      row("ASSISTANT", "Opšti rok je deset godina [1].", 2),
      row("USER", "(attachment)", 3, [{ originalName: "ugovor.pdf" }]),
      row("USER", "A za zaradu?", 5),
    ]);

    const context = await builder.build({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      messageId: "message-4",
    });

    expect(context.messages).toEqual([
      { role: "user", content: "Koliki je rok zastarelosti?" },
      { role: "assistant", content: "Opšti rok je deset godina [1]." },
      {
        role: "user",
        content:
          "[Prilozi: ugovor.pdf — tekst: search_documents / read_document]",
      },
      { role: "user", content: "A za zaradu?" },
    ]);
    expect(context.sessionCaseId).toBe("case-1");
    expect(context.caseContext).toContain("Spor o zaradama");
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sessionId: "session-1",
          status: "COMPLETED",
          createdAt: { lte: trigger },
        }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("drops the oldest turns to fit the budget but keeps the current message", async () => {
    const { builder } = setup(
      [
        row("USER", "a".repeat(40), 1),
        row("ASSISTANT", "b".repeat(40), 2),
        row("USER", "c".repeat(40), 3),
      ],
      { assistantHistoryMaxChars: 50 },
    );

    const context = await builder.build({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      messageId: "message-3",
    });

    expect(context.messages).toEqual([
      { role: "user", content: "c".repeat(40) },
    ]);
  });

  it("never starts the conversation with an assistant turn", async () => {
    const { builder } = setup(
      [
        row("USER", "a".repeat(40), 1),
        row("ASSISTANT", "b".repeat(10), 2),
        row("USER", "c".repeat(10), 3),
      ],
      { assistantHistoryMaxChars: 25 },
    );

    const context = await builder.build({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      messageId: "message-3",
    });

    expect(context.messages.map((message) => message.role)).toEqual(["user"]);
  });

  it("adds the conversation drafts as workspace state", async () => {
    const drafting = {
      workspaceState: jest
        .fn()
        .mockResolvedValue("Nacrti u ovom razgovoru:\n- id draft-1, v1"),
    };
    const { builder } = setup([row("USER", "Skrati nacrt.", 1)], {}, drafting);

    const context = await builder.build({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      messageId: "message-1",
    });

    expect(drafting.workspaceState).toHaveBeenCalledWith(
      "workspace-1",
      "session-1",
    );
    expect(context.workspaceState).toContain("id draft-1, v1");
  });

  it("reads only turns after the summary cursor and passes the summary", async () => {
    const cursor = new Date("2026-09-27T10:02:00.000Z");
    const { builder, prisma } = setup([row("USER", "A kraće?", 5)]);
    prisma.chatSession.findFirst.mockResolvedValue({
      summary: "- Тужилац: Петар Петровић",
      summaryThroughAt: cursor,
    });

    const context = await builder.build({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      messageId: "message-5",
    });

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { lte: trigger, gt: cursor },
        }),
      }),
    );
    expect(context.conversationSummary).toBe("- Tužilac: Petar Petrović");
    expect(context.messages).toEqual([{ role: "user", content: "A kraće?" }]);
  });

  it("names the conversation's owner in Latin script", async () => {
    const { builder, prisma } = setup([row("USER", "Koje rokove imam?", 1)]);
    prisma.chatSession.findFirst.mockResolvedValue({
      summary: null,
      summaryThroughAt: null,
      createdBy: {
        id: "user-1",
        firstName: "Ана",
        lastName: "Анић",
        email: "ana@example.test",
      },
    });

    const context = await builder.build({
      workspaceId: "workspace-1",
      sessionId: "session-1",
    });

    expect(context.currentUser).toEqual({
      id: "user-1",
      displayName: "Ana Anić",
    });
  });

  it("gives triage the earlier turns without the current message", async () => {
    const { builder } = setup([
      row("USER", "Pitanje o otkazu", 1),
      row("ASSISTANT", "Odgovor o otkazu", 2),
      row("USER", "A kraće?", 3),
    ]);

    await expect(
      builder.triageHistory("session-1", "message-3"),
    ).resolves.toEqual([
      { role: "user", content: "Pitanje o otkazu" },
      { role: "assistant", content: "Odgovor o otkazu" },
    ]);
  });
});
