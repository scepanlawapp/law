import { ChatStreamEvent } from "@law/api-interfaces";
import { ChatEventBus, DocumentContentListener } from "@law/chat";
import { DocumentContentEvents } from "@law/document-ingestion";

function setup(
  rows: Array<{ id: string; sessionId: string }> = [
    { id: "att-1", sessionId: "session-1" },
    { id: "att-2", sessionId: "session-1" },
    { id: "att-3", sessionId: "session-2" },
  ],
) {
  const prisma = {
    chatAttachment: { findMany: jest.fn(async () => rows) },
  };
  const contentEvents = new DocumentContentEvents();
  const bus = new ChatEventBus();
  const emitted: ChatStreamEvent[] = [];
  bus.streamWorkspace("workspace-1").subscribe((event) => emitted.push(event));
  const listener = new DocumentContentListener(
    prisma as never,
    contentEvents,
    bus,
  );
  return { prisma, contentEvents, bus, emitted, listener };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("DocumentContentListener", () => {
  it("emits one document.content.updated per session holding the content", async () => {
    const { prisma, contentEvents, emitted, listener } = setup();
    listener.onModuleInit();

    contentEvents.emit({
      workspaceId: "workspace-1",
      contentId: "content-1",
      status: "READY",
    });
    await flush();

    expect(prisma.chatAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace-1", contentId: "content-1" },
      }),
    );
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toMatchObject({
      type: "document.content.updated",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      attachmentIds: ["att-1", "att-2"],
      status: "READY",
    });
    expect(emitted[1]).toMatchObject({
      sessionId: "session-2",
      attachmentIds: ["att-3"],
    });
    expect(typeof emitted[0].createdAt).toBe("string");
    listener.onModuleDestroy();
  });

  it("maps pipeline states to the document AI status", async () => {
    const { contentEvents, emitted, listener } = setup([
      { id: "att-1", sessionId: "session-1" },
    ]);
    listener.onModuleInit();

    contentEvents.emit({
      workspaceId: "workspace-1",
      contentId: "content-1",
      status: "EMBEDDING",
    });
    await flush();

    expect(emitted[0].status).toBe("PROCESSING");
    listener.onModuleDestroy();
  });

  it("emits nothing when no chat attachment holds the content", async () => {
    const { contentEvents, emitted, listener } = setup([]);
    listener.onModuleInit();

    contentEvents.emit({
      workspaceId: "workspace-1",
      contentId: "content-9",
      status: "READY",
    });
    await flush();

    expect(emitted).toEqual([]);
    listener.onModuleDestroy();
  });

  it("stops listening after destroy and survives lookup failures", async () => {
    const { prisma, contentEvents, emitted, listener } = setup();
    listener.onModuleInit();
    prisma.chatAttachment.findMany.mockRejectedValueOnce(new Error("db down"));

    contentEvents.emit({
      workspaceId: "workspace-1",
      contentId: "content-1",
      status: "READY",
    });
    await flush();
    expect(emitted).toEqual([]);

    listener.onModuleDestroy();
    contentEvents.emit({
      workspaceId: "workspace-1",
      contentId: "content-1",
      status: "READY",
    });
    await flush();
    expect(prisma.chatAttachment.findMany).toHaveBeenCalledTimes(1);
  });
});
