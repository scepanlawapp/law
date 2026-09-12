import { UserSettingsController } from "@law/user-settings";

describe("UserSettingsController", () => {
  it("soft-deletes all conversations for the authenticated user", async () => {
    const tenantPrisma = {
      chatSession: {
        deleteMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const tenantRegistry = {
      listWorkspacesForUser: jest.fn().mockResolvedValue([{ id: "ws-1" }]),
      resolveTenantForWorkspace: jest.fn().mockResolvedValue({
        tenant: { schemaName: "tenant_ws1" },
      }),
    };
    const connectionManager = {
      getTenantClient: jest.fn().mockReturnValue(tenantPrisma),
    };
    const controller = new UserSettingsController(
      { get: jest.fn(), update: jest.fn() } as never,
      {} as never,
      tenantRegistry as never,
      connectionManager as never,
    );

    await expect(
      controller.clearConversationHistory({
        headers: {},
        auth: { user: { id: "user-1" } },
      } as never),
    ).resolves.toEqual({ deleted: 3 });

    expect(tenantPrisma.chatSession.updateMany).toHaveBeenCalledWith({
      where: { createdByUserId: "user-1", workspaceId: "ws-1" },
      data: { isDeleted: true },
    });
    expect(tenantPrisma.chatSession.deleteMany).not.toHaveBeenCalled();
  });
});
