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
    const controller = new ChatController(chat as never);

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
