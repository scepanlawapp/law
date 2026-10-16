import { UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { AuthService } from "@law/auth";

const SESSION_TOKEN = "session-token";

function passwordHash(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function createService() {
  const op = (name: string) => jest.fn((arg: unknown) => ({ name, arg }));
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: op("user.update"),
    },
    authToken: {
      create: op("authToken.create"),
      findFirst: jest.fn(),
      update: op("authToken.update"),
      updateMany: jest.fn((arg: unknown) => ({
        name: "authToken.updateMany",
        arg,
        count: 1,
      })),
    },
    authSession: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: op("authSession.updateMany"),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === "function" ? arg(prisma) : arg,
    ),
  };
  const mail = {
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendPasswordChanged: jest.fn().mockResolvedValue(undefined),
  };
  const rateLimit = { hit: jest.fn().mockResolvedValue(1) };
  const service = new AuthService(
    prisma as never,
    mail as never,
    rateLimit as never,
  );
  return { service, prisma, mail };
}

const openResetTokens = (userId: string) => ({
  where: { userId, purpose: "PASSWORD_RESET", consumedAt: null },
  data: { consumedAt: expect.any(Date) },
});

describe("AuthService password hardening", () => {
  it("new reset request consumes earlier open reset tokens", async () => {
    const { service, prisma, mail } = createService();
    const user = { id: "user-1", email: "ana@example.com", status: "ACTIVE" };
    prisma.user.findUnique.mockResolvedValue(user);

    await service.requestPasswordReset("ana@example.com");

    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
      openResetTokens("user-1"),
    );
    expect(prisma.authToken.create).toHaveBeenCalledTimes(1);
    const [ops] = prisma.$transaction.mock.calls[0];
    expect(ops.map((o: { name: string }) => o.name)).toEqual([
      "authToken.updateMany",
      "authToken.create",
    ]);
    expect(mail.sendPasswordReset).toHaveBeenCalledWith(
      user,
      expect.any(String),
    );
  });

  it("reset claims the token atomically, consumes open tokens and notifies", async () => {
    const { service, prisma, mail } = createService();
    prisma.authToken.findFirst.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      user: { id: "user-1", email: "ana@example.com" },
    });

    await service.resetPassword("raw-reset", "NewPassword123!");

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.authToken.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "token-1",
        consumedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { consumedAt: expect.any(Date) },
    });
    expect(prisma.authToken.updateMany).toHaveBeenNthCalledWith(
      2,
      openResetTokens("user-1"),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        passwordHash: expect.any(String),
        status: "ACTIVE",
      }),
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mail.sendPasswordChanged).toHaveBeenCalledWith(
      { id: "user-1", email: "ana@example.com" },
      expect.any(Date),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "PASSWORD_RESET_COMPLETED" }),
    });
  });

  it("a token consumed concurrently is rejected", async () => {
    const { service, prisma, mail } = createService();
    prisma.authToken.findFirst.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      user: { id: "user-1", email: "ana@example.com" },
    });
    prisma.authToken.updateMany.mockReturnValueOnce({ count: 0 } as never);

    await expect(
      service.resetPassword("raw-reset", "NewPassword123!"),
    ).rejects.toThrow(new UnauthorizedException("Invalid reset token"));

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.authToken.updateMany).toHaveBeenCalledTimes(1);
    expect(mail.sendPasswordChanged).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("reset with an invalid token throws and sends nothing", async () => {
    const { service, prisma, mail } = createService();
    prisma.authToken.findFirst.mockResolvedValue(null);

    await expect(
      service.resetPassword("bad", "NewPassword123!"),
    ).rejects.toThrow(new UnauthorizedException("Invalid reset token"));
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.sendPasswordChanged).not.toHaveBeenCalled();
  });

  it("failed reset transaction sends no email", async () => {
    const { service, prisma, mail } = createService();
    prisma.authToken.findFirst.mockResolvedValue({
      id: "token-1",
      userId: "user-1",
      user: { id: "user-1", email: "ana@example.com" },
    });
    prisma.$transaction.mockRejectedValue(new Error("db down"));

    await expect(
      service.resetPassword("raw-reset", "NewPassword123!"),
    ).rejects.toThrow("db down");
    expect(mail.sendPasswordChanged).not.toHaveBeenCalled();
  });

  function sessionRecord(currentPassword: string) {
    return {
      id: "session-current",
      user: {
        id: "user-1",
        email: "ana@example.com",
        passwordHash: passwordHash(currentPassword),
        memberships: [],
      },
    };
  }

  it("change password revokes other sessions but keeps the current one", async () => {
    const { service, prisma } = createService();
    prisma.authSession.findFirst.mockResolvedValue(
      sessionRecord("OldPassword1!"),
    );

    await service.changePassword(
      SESSION_TOKEN,
      "OldPassword1!",
      "NewPassword123!",
    );

    expect(prisma.authSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          refreshTokenHash: createHash("sha256")
            .update(SESSION_TOKEN)
            .digest("hex"),
        }),
      }),
    );
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        revokedAt: null,
        id: { not: "session-current" },
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("change password consumes open reset tokens and notifies", async () => {
    const { service, prisma, mail } = createService();
    prisma.authSession.findFirst.mockResolvedValue(
      sessionRecord("OldPassword1!"),
    );

    await service.changePassword(
      SESSION_TOKEN,
      "OldPassword1!",
      "NewPassword123!",
    );

    expect(prisma.authToken.updateMany).toHaveBeenCalledWith(
      openResetTokens("user-1"),
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [ops] = prisma.$transaction.mock.calls[0];
    expect(ops.map((o: { name: string }) => o.name)).toEqual([
      "user.update",
      "authSession.updateMany",
      "authToken.updateMany",
    ]);
    expect(mail.sendPasswordChanged).toHaveBeenCalledWith(
      { id: "user-1", email: "ana@example.com" },
      expect.any(Date),
    );
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "PASSWORD_CHANGED" }),
    });
  });

  it("wrong current password changes nothing", async () => {
    const { service, prisma, mail } = createService();
    prisma.authSession.findFirst.mockResolvedValue(
      sessionRecord("OldPassword1!"),
    );

    await expect(
      service.changePassword(
        SESSION_TOKEN,
        "WrongPassword!",
        "NewPassword123!",
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.authToken.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mail.sendPasswordChanged).not.toHaveBeenCalled();
  });
});
