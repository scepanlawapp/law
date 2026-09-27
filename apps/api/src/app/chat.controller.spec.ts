import { ChatController } from "@law/chat";

describe("ChatController DOCX export", () => {
  it("sets DOCX response headers and sends the generated buffer", async () => {
    const buffer = Buffer.from("docx");
    const chat = {
      exportDraft: jest.fn().mockResolvedValue({
        buffer,
        filename: "tuzba-session1-2026-09-06.docx",
      }),
    };
    const response = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
    const controller = new ChatController(chat as never, {} as never);

    await controller.exportDraft(
      {
        workspace: { workspaceId: "workspace-1" },
        auth: { user: { id: "user-1" } },
      } as never,
      "draft-1",
      { format: "docx", script: "latin" },
      response as never,
    );

    expect(chat.exportDraft).toHaveBeenCalledWith(
      "workspace-1",
      "draft-1",
      "user-1",
      "latin",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="tuzba-session1-2026-09-06.docx"',
    );
    expect(response.setHeader).toHaveBeenCalledWith("Content-Length", "4");
    expect(response.send).toHaveBeenCalledWith(buffer);
  });
});

describe("ChatController pending actions", () => {
  it("decides with the authenticated user as the decider", async () => {
    const actions = { decide: jest.fn().mockResolvedValue({ id: "action-1" }) };
    const controller = new ChatController({} as never, actions as never);
    const request = {
      workspace: { workspaceId: "workspace-1" },
      auth: { user: { id: "user-1" } },
    } as never;

    await controller.approvePendingAction(request, "action-1");
    await controller.declinePendingAction(request, "action-1", {
      reason: "Pogrešan datum",
    });

    expect(actions.decide).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-1",
      userId: "user-1",
      actionId: "action-1",
      decision: "APPROVE",
    });
    expect(actions.decide).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-1",
      userId: "user-1",
      actionId: "action-1",
      decision: "DECLINE",
      reason: "Pogrešan datum",
    });
  });
});
