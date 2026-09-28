import { WorkspaceRole } from "@law/api-interfaces";
import { ChatDocumentPromotionService } from "@law/chat";
import { WorkspaceContextService } from "@law/core";

const context = {
  workspaceId: "workspace-1",
  userId: "user-1",
  role: WorkspaceRole.MEMBER,
};

function setup(options: { caseLinked?: boolean } = {}) {
  const prisma = {
    chatSession: {
      findFirst: jest.fn(async () =>
        options.caseLinked === false
          ? null
          : { case: { id: "case-1", clientId: "client-1" } },
      ),
    },
    chatAttachment: {
      findMany: jest.fn(async () => [
        {
          id: "att-1",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          originalName: "ugovor o zakupu.pdf",
          storedName: "att-1",
          extractionStatus: "COMPLETED",
          extractedText: "Ugovor o zakupu",
          sourceScript: "LATIN",
        },
        {
          id: "att-2",
          workspaceId: "workspace-1",
          sessionId: "session-1",
          originalName: "slika.png",
          storedName: "att-2",
          extractionStatus: "PENDING",
          extractedText: null,
          sourceScript: null,
        },
      ]),
      update: jest.fn(async () => ({})),
    },
  };
  const storage = { read: jest.fn(async () => Buffer.from("%PDF")) };
  const documents = {
    create: jest.fn(async (input: { idempotencyKey: string }) => ({
      id: `doc-${input.idempotencyKey.split(":")[1]}`,
    })),
  };
  return {
    prisma,
    storage,
    documents,
    service: new ChatDocumentPromotionService(
      prisma as never,
      storage as never,
      documents as never,
    ),
  };
}

describe("ChatDocumentPromotionService", () => {
  it("files unpromoted attachments on the case and its client", async () => {
    const { service, prisma, documents } = setup();

    const count = await WorkspaceContextService.run(context, () =>
      service.promoteSession("workspace-1", "session-1"),
    );

    expect(count).toBe(2);
    expect(prisma.chatAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId: "workspace-1",
          sessionId: "session-1",
          documentId: null,
        },
      }),
    );
    expect(documents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "ugovor o zakupu",
        caseIds: ["case-1"],
        clientIds: ["client-1"],
        originalFilename: "ugovor o zakupu.pdf",
        idempotencyKey: "chat-attachment:att-1",
        source: "CHAT_ATTACHMENT",
        initialText: {
          status: "COMPLETED",
          text: "Ugovor o zakupu",
          sourceScript: "LATIN",
        },
      }),
    );
    expect(documents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "chat-attachment:att-2",
        initialText: undefined,
      }),
    );
    expect(prisma.chatAttachment.update).toHaveBeenCalledWith({
      where: { id: "att-1" },
      data: { documentId: "doc-att-1" },
    });
  });

  it("does nothing without a linked case or outside the workspace context", async () => {
    const unlinked = setup({ caseLinked: false });
    await WorkspaceContextService.run(context, () =>
      unlinked.service.promoteSession("workspace-1", "session-1"),
    );
    expect(unlinked.documents.create).not.toHaveBeenCalled();

    const noContext = setup();
    expect(
      await noContext.service.promoteSession("workspace-1", "session-1"),
    ).toBe(0);
    expect(noContext.prisma.chatSession.findFirst).not.toHaveBeenCalled();
  });

  it("keeps going when one attachment fails and never throws", async () => {
    const { service, documents, prisma } = setup();
    documents.create.mockRejectedValueOnce(new Error("Unsupported file type"));

    const count = await WorkspaceContextService.run(context, () =>
      service.promoteSession("workspace-1", "session-1"),
    );

    expect(count).toBe(1);
    expect(prisma.chatAttachment.update).toHaveBeenCalledTimes(1);
    expect(prisma.chatAttachment.update).toHaveBeenCalledWith({
      where: { id: "att-2" },
      data: { documentId: "doc-att-2" },
    });
  });
});
