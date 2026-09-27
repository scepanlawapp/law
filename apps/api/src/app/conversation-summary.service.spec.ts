import { FakeChatModelProvider } from "@law/llm";
import { ChatRuntimeConfig, ConversationSummaryService } from "@law/chat";

const base = new Date("2026-09-27T10:00:00.000Z");

function rows(count: number, size = 20) {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "USER" : "ASSISTANT",
    content: `${index % 2 === 0 ? "Pitanje" : "Odgovor"} ${index} ${"x".repeat(size)}`,
    attachments: [],
    createdAt: new Date(base.getTime() + index * 60_000),
  }));
}

function setup(
  messages: ReturnType<typeof rows>,
  session: { summary: string | null; summaryThroughAt: Date | null } = {
    summary: null,
    summaryThroughAt: null,
  },
  providerOutput: unknown = { summary: "- Tužilac: Petar Petrović" },
) {
  const prisma = {
    chatSession: {
      findFirst: jest.fn().mockResolvedValue(session),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    chatMessage: { findMany: jest.fn().mockResolvedValue(messages) },
  };
  // Window of 10 → trigger above 8 unsummarized messages, keep the last 4.
  const config = Object.assign(new ChatRuntimeConfig(), {
    assistantHistoryMaxMessages: 10,
    assistantHistoryMaxChars: 24_000,
    openRouterModel: "test-model",
  });
  const provider = new FakeChatModelProvider(providerOutput);
  const completeStructured = jest.spyOn(provider, "completeStructured");
  const service = new ConversationSummaryService(
    prisma as never,
    config,
    provider,
  );
  return { service, prisma, completeStructured };
}

describe("ConversationSummaryService", () => {
  it("does nothing while the conversation fits the window", async () => {
    const { service, prisma, completeStructured } = setup(rows(8));

    await expect(service.refresh("workspace-1", "session-1")).resolves.toBe(
      false,
    );
    expect(completeStructured).not.toHaveBeenCalled();
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });

  it("folds the oldest turns and keeps the most recent verbatim", async () => {
    const messages = rows(9);
    const { service, prisma, completeStructured } = setup(messages);

    await expect(service.refresh("workspace-1", "session-1")).resolves.toBe(
      true,
    );

    const prompt = completeStructured.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain("Pitanje 0");
    expect(prompt).toContain("Pitanje 4");
    expect(prompt).not.toContain("Odgovor 5");
    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        workspaceId: "workspace-1",
        summaryThroughAt: null,
      },
      data: {
        summary: "- Tužilac: Petar Petrović",
        summaryThroughAt: messages[4].createdAt,
        summaryUpdatedAt: expect.any(Date),
        summaryModel: "test-model",
      },
    });
  });

  it("extends an existing summary from its cursor", async () => {
    const cursor = new Date(base.getTime() - 60_000);
    const { service, prisma, completeStructured } = setup(rows(9), {
      summary: "- Ranije: ugovor o radu",
      summaryThroughAt: cursor,
    });

    await service.refresh("workspace-1", "session-1");

    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { gt: cursor } }),
      }),
    );
    expect(completeStructured.mock.calls[0][0].messages[1].content).toContain(
      "- Ranije: ugovor o radu",
    );
    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ summaryThroughAt: cursor }),
      }),
    );
  });

  it("also summarizes when a few long messages exceed the character budget", async () => {
    const { service, completeStructured } = setup(rows(4, 7_000));

    await expect(service.refresh("workspace-1", "session-1")).resolves.toBe(
      true,
    );
    expect(completeStructured).toHaveBeenCalledTimes(1);
  });

  it("never throws when summarization fails", async () => {
    const { service, prisma } = setup(rows(9), undefined, { summary: "" });

    await expect(service.refresh("workspace-1", "session-1")).resolves.toBe(
      false,
    );
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });

  it("reports no change when another turn advanced the cursor first", async () => {
    const { service, prisma } = setup(rows(9));
    prisma.chatSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refresh("workspace-1", "session-1")).resolves.toBe(
      false,
    );
  });
});
