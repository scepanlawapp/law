import { UserSettingsController } from "@law/user-settings";

describe("UserSettingsController", () => {
  it("soft-deletes all conversations for the authenticated user", async () => {
    const prisma = {
      chatSession: {
        deleteMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const controller = new UserSettingsController(
      { get: jest.fn(), update: jest.fn() } as never,
      prisma as never,
    );

    await expect(
      controller.clearConversationHistory({
        auth: { user: { id: "user-1" } },
      } as never),
    ).resolves.toEqual({ deleted: 3 });

    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith({
      where: { createdByUserId: "user-1" },
      data: { isDeleted: true },
    });
    expect(prisma.chatSession.deleteMany).not.toHaveBeenCalled();
  });
});